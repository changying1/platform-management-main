#!/usr/bin/env python3
"""测试MongoDB数据提取逻辑"""
import json
import os

def extract_companies_from_json(file_path):
    """从JSON文件中提取分公司信息"""
    companies = set()
    
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for alarm in data:
        branch_id = alarm.get("branch_id")
        location_desc = str(alarm.get("location_desc") or "")
        
        if branch_id:
            companies.add((int(branch_id) if branch_id else None, f"分公司{branch_id}"))
        
        # 从 location_desc 中提取公司信息
        if "-" in location_desc:
            parts = location_desc.split("-")
            if len(parts) > 0:
                company_part = parts[0].strip()
                if company_part and "项目" in company_part:
                    company_name = company_part.replace("项目", "分公司")
                    companies.add((None, company_name))
    
    # 转换为列表格式
    result = []
    seen_names = set()
    for idx, (cid, name) in enumerate(sorted(companies, key=lambda x: (x[0] or 99999, x[1])), start=1):
        if name in seen_names:
            continue
        seen_names.add(name)
        result.append({
            "id": cid or idx,
            "name": name if name else f"分公司{idx}"
        })
    
    return result

def extract_projects_from_json(file_path):
    """从JSON文件中提取项目信息"""
    projects = set()
    
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for alarm in data:
        project_id = alarm.get("project_id")
        location_desc = str(alarm.get("location_desc") or "")
        branch_id = alarm.get("branch_id")
        
        # 从 location_desc 提取项目
        if "-" in location_desc:
            parts = location_desc.split("-")
            if len(parts) > 0:
                project_part = parts[0].strip()
                if project_part and ("项目" in project_part or "地铁" in project_part or "东站" in project_part):
                    projects.add((int(project_id) if project_id else None, project_part, int(branch_id) if branch_id else None))
    
    # 转换为列表格式
    result = []
    seen_names = set()
    for idx, (pid, name, bid) in enumerate(sorted(projects, key=lambda x: (x[0] or 99999, x[1])), start=1):
        if name in seen_names:
            continue
        seen_names.add(name)
        result.append({
            "id": pid or idx,
            "name": name,
            "branch_id": bid
        })
    
    return result

if __name__ == "__main__":
    json_file = "MongoData/smart_helmet_mongo.alarm_record.json"
    
    if not os.path.exists(json_file):
        print(f"❌ 文件不存在: {json_file}")
        exit(1)
    
    print("🔍 从JSON文件提取数据...")
    
    companies = extract_companies_from_json(json_file)
    print("\n📋 分公司列表:")
    for company in companies:
        print(f"  - {company['id']}: {company['name']}")
    
    projects = extract_projects_from_json(json_file)
    print("\n📋 项目列表:")
    for project in projects:
        print(f"  - {project['id']}: {project['name']} (分公司ID: {project['branch_id']})")
    
    print("\n✅ 数据提取完成！")
