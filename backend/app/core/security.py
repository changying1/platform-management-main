from fastapi import Header

def get_current_user(
    x_role: str | None = Header(default=None),
    x_department_id: str | None = Header(default=None),
    x_username: str | None = Header(default=None),
):
    # ✅ 没传就当总部(保证不影响你原功能)
    role = (x_role or "HQ").upper()

    dep = None
    if x_department_id not in (None, "", "null", "NULL"):
        try:
            dep = int(x_department_id)
        except:
            dep = None

    return {
        "role": role,
        "department_id": dep,
        "username": x_username,
    }
