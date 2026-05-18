"""
Import the project MySQL dump into MongoDB collections.

Default behavior is intentionally conservative:
- Read company-management.sql from the project root.
- Import each SQL table into a Mongo collection named sql_<table>.
- Store parsed table schemas in sql__schemas.
- Do not touch the existing Mongo collections such as device/fence/alarm_record.

Examples:
  python backend/scripts/import_sql_to_mongo.py --dry-run
  python backend/scripts/import_sql_to_mongo.py
  python backend/scripts/import_sql_to_mongo.py --prefix "" --drop
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable

try:
    from pymongo import InsertOne, MongoClient, ReplaceOne
except ImportError:
    InsertOne = None
    MongoClient = None
    ReplaceOne = None


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SQL_FILE = PROJECT_ROOT / "company-management.sql"
DEFAULT_MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
DEFAULT_MONGO_DB = os.getenv("MONGO_DB_NAME", "smart_helmet_mongo")


CREATE_RE = re.compile(r"^CREATE TABLE `(?P<table>[^`]+)`")
INSERT_RE = re.compile(r"^INSERT INTO `(?P<table>[^`]+)` VALUES\s*(?P<values>.*);$")
COLUMN_RE = re.compile(r"^\s*`(?P<name>[^`]+)`\s+(?P<type>.+?)(?:\s+COMMENT\s+'.*')?(?:,)?\s*$")
PRIMARY_RE = re.compile(r"PRIMARY KEY \(`(?P<column>[^`]+)`\)")
INDEX_RE = re.compile(r"(?:INDEX|KEY|UNIQUE INDEX|UNIQUE KEY)\s+`(?P<name>[^`]+)`\(`(?P<column>[^`]+)`")
FK_RE = re.compile(
    r"FOREIGN KEY \(`(?P<column>[^`]+)`\) REFERENCES `(?P<ref_table>[^`]+)` \(`(?P<ref_column>[^`]+)`\)"
)


def split_sql_values(values_blob: str) -> list[list[Any]]:
    rows: list[list[Any]] = []
    current_row: list[Any] | None = None
    token: list[str] = []
    in_string = False
    escape = False
    depth = 0

    def finish_token() -> None:
        if current_row is not None:
            raw = "".join(token).strip()
            current_row.append(convert_sql_value(raw))
            token.clear()

    for ch in values_blob:
        if in_string:
            token.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == "'":
                in_string = False
            continue

        if ch == "'":
            in_string = True
            token.append(ch)
        elif ch == "(":
            if depth == 0:
                current_row = []
                token.clear()
            else:
                token.append(ch)
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                finish_token()
                if current_row is not None:
                    rows.append(current_row)
                current_row = None
            else:
                token.append(ch)
        elif ch == "," and depth == 1:
            finish_token()
        elif depth > 0:
            token.append(ch)

    return rows


def convert_sql_value(raw: str) -> Any:
    if raw == "" or raw.upper() == "NULL":
        return None
    if raw.upper() in {"TRUE", "FALSE"}:
        return raw.upper() == "TRUE"
    if raw.startswith("'") and raw.endswith("'"):
        return unescape_sql_string(raw[1:-1])
    if raw.startswith("b'") and raw.endswith("'"):
        return raw[2:-1] == "1"
    if raw.startswith("0x"):
        return raw
    try:
        if re.fullmatch(r"[-+]?\d+", raw):
            return int(raw)
        if re.fullmatch(r"[-+]?\d+\.\d+", raw):
            return float(Decimal(raw))
    except Exception:
        pass
    return raw


def unescape_sql_string(value: str) -> str:
    replacements = {
        r"\\": "\\",
        r"\'": "'",
        r"\"": '"',
        r"\n": "\n",
        r"\r": "\r",
        r"\t": "\t",
        r"\0": "\0",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def parse_sql_file(sql_file: Path) -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    schemas: dict[str, dict[str, Any]] = {}
    insert_counts: dict[str, int] = {}
    current_table: str | None = None

    with sql_file.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.rstrip("\n")
            create_match = CREATE_RE.match(line)
            if create_match:
                current_table = create_match.group("table")
                schemas[current_table] = {
                    "table": current_table,
                    "columns": [],
                    "primary_key": None,
                    "indexes": [],
                    "foreign_keys": [],
                }
                continue

            if current_table:
                if line.startswith(") ENGINE"):
                    current_table = None
                    continue
                col_match = COLUMN_RE.match(line)
                if col_match:
                    schemas[current_table]["columns"].append(
                        {
                            "name": col_match.group("name"),
                            "type": col_match.group("type").rstrip(","),
                        }
                    )
                    continue
                primary_match = PRIMARY_RE.search(line)
                if primary_match:
                    schemas[current_table]["primary_key"] = primary_match.group("column")
                    continue
                index_match = INDEX_RE.search(line)
                if index_match:
                    schemas[current_table]["indexes"].append(
                        {
                            "name": index_match.group("name"),
                            "column": index_match.group("column"),
                        }
                    )
                fk_match = FK_RE.search(line)
                if fk_match:
                    schemas[current_table]["foreign_keys"].append(fk_match.groupdict())
                continue

            insert_match = INSERT_RE.match(line)
            if insert_match:
                table = insert_match.group("table")
                row_count = len(split_sql_values(insert_match.group("values")))
                insert_counts[table] = insert_counts.get(table, 0) + row_count

    return schemas, insert_counts


def iter_insert_documents(sql_file: Path, schemas: dict[str, dict[str, Any]]) -> Iterable[tuple[str, dict[str, Any]]]:
    with sql_file.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.rstrip("\n")
            insert_match = INSERT_RE.match(line)
            if not insert_match:
                continue
            table = insert_match.group("table")
            schema = schemas.get(table)
            if not schema:
                continue
            columns = [col["name"] for col in schema["columns"]]
            primary_key = schema.get("primary_key")

            for row in split_sql_values(insert_match.group("values")):
                doc = {col: row[idx] if idx < len(row) else None for idx, col in enumerate(columns)}
                doc["_sql_table"] = table
                if primary_key and doc.get(primary_key) is not None:
                    doc["_id"] = doc[primary_key]
                yield table, doc


def collection_name(prefix: str, table: str) -> str:
    return f"{prefix}{table}" if prefix else table


def ensure_indexes(db: Any, prefix: str, schemas: dict[str, dict[str, Any]]) -> None:
    for table, schema in schemas.items():
        coll = db[collection_name(prefix, table)]
        primary_key = schema.get("primary_key")
        if primary_key and primary_key != "_id":
            coll.create_index(primary_key)
        for index in schema.get("indexes", []):
            column = index.get("column")
            if column and column != primary_key:
                coll.create_index(column)
        for col in schema.get("columns", []):
            name = col["name"]
            if name.endswith("_id") and name != primary_key:
                coll.create_index(name)


def import_to_mongo(
    sql_file: Path,
    mongo_url: str,
    db_name: str,
    prefix: str,
    drop: bool,
    batch_size: int,
    dry_run: bool,
) -> int:
    schemas, insert_counts = parse_sql_file(sql_file)

    print(f"SQL file: {sql_file}")
    print(f"Tables: {len(schemas)}")
    print(f"Rows: {sum(insert_counts.values())}")
    for table in sorted(schemas):
        print(f"  {table}: {insert_counts.get(table, 0)} rows -> {collection_name(prefix, table)}")

    if dry_run:
        print("Dry run only. No MongoDB writes were performed.")
        return 0

    if MongoClient is None or InsertOne is None or ReplaceOne is None:
        print("pymongo is not installed. Install it with: python -m pip install pymongo", file=sys.stderr)
        return 1

    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    db = client[db_name]

    schema_collection = db[collection_name(prefix, "_schemas")]
    if drop:
        for table in schemas:
            db[collection_name(prefix, table)].drop()
        schema_collection.drop()

    schema_docs = []
    imported_at = datetime.utcnow()
    for table, schema in schemas.items():
        schema_doc = dict(schema)
        schema_doc["_id"] = table
        schema_doc["source_file"] = str(sql_file)
        schema_doc["imported_at"] = imported_at
        schema_docs.append(schema_doc)
    if schema_docs:
        schema_collection.bulk_write(
            [ReplaceOne({"_id": doc["_id"]}, doc, upsert=True) for doc in schema_docs],
            ordered=False,
        )

    pending: dict[str, list[Any]] = {}
    imported_counts: dict[str, int] = {}

    def flush(table: str) -> None:
        ops = pending.get(table)
        if not ops:
            return
        db[collection_name(prefix, table)].bulk_write(ops, ordered=False)
        imported_counts[table] = imported_counts.get(table, 0) + len(ops)
        pending[table] = []

    for table, doc in iter_insert_documents(sql_file, schemas):
        if "_id" in doc:
            pending.setdefault(table, []).append(ReplaceOne({"_id": doc["_id"]}, doc, upsert=True))
        else:
            pending.setdefault(table, []).append(InsertOne(doc))
        if len(pending[table]) >= batch_size:
            flush(table)

    for table in list(pending):
        flush(table)

    ensure_indexes(db, prefix, schemas)

    print("\nMongoDB import completed.")
    print(f"Database: {db_name}")
    for table in sorted(schemas):
        print(f"  {collection_name(prefix, table)}: {imported_counts.get(table, 0)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Import company-management.sql into MongoDB.")
    parser.add_argument("--sql-file", default=str(DEFAULT_SQL_FILE), help="Path to the MySQL dump file.")
    parser.add_argument("--mongo-url", default=DEFAULT_MONGO_URL, help="MongoDB connection URL.")
    parser.add_argument("--db", default=DEFAULT_MONGO_DB, help="MongoDB database name.")
    parser.add_argument("--prefix", default="sql_", help="Collection prefix. Use --prefix \"\" for original table names.")
    parser.add_argument("--drop", action="store_true", help="Drop target collections before importing.")
    parser.add_argument("--batch-size", type=int, default=1000, help="Mongo bulk insert batch size.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and print stats without writing MongoDB.")
    args = parser.parse_args()

    sql_file = Path(args.sql_file).resolve()
    if not sql_file.exists():
        print(f"SQL file not found: {sql_file}", file=sys.stderr)
        return 1

    return import_to_mongo(
        sql_file=sql_file,
        mongo_url=args.mongo_url,
        db_name=args.db,
        prefix=args.prefix,
        drop=args.drop,
        batch_size=args.batch_size,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    raise SystemExit(main())
