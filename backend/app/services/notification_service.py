import json
import smtplib
from email.mime.text import MIMEText
from typing import Any, Dict, List
from urllib import request

from app.utils.config_manager import get_system_settings
from app.utils.logger import get_logger


logger = get_logger("NotificationService")


class NotificationService:
    def __init__(self):
        self.channels = ["in_app", "email", "sms", "call"]
        logger.info("Notification service initialized")

    def _severity_key(self, severity: str) -> str:
        value = str(severity or "").lower()
        if value in {"high", "severe", "critical"}:
            return "Severe"
        if value in {"medium", "risk", "warning"}:
            return "Medium"
        return "Low"

    def _enabled_recipients(self, recipients: List[dict], severity: str) -> List[dict]:
        level = self._severity_key(severity).lower()
        return [
            item for item in (recipients or [])
            if item.get("enabled", True) and item.get("phone") and item.get("level", "all") in {"all", level}
        ]

    def _post_json(self, url: str, payload: dict, api_key: str = "") -> dict:
        if not url:
            return {"success": False, "error": "missing url"}
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            headers["X-API-Key"] = api_key
        req = request.Request(url, data=data, headers=headers, method="POST")
        with request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return {"success": 200 <= resp.status < 300, "status": resp.status, "body": body}

    def _send_sms(self, settings: dict, alarm_data: Dict[str, Any], recipients: List[dict]) -> dict:
        payload = {
            "templateId": settings.get("smsTemplateId"),
            "sign": settings.get("smsSign"),
            "phones": [item["phone"] for item in recipients],
            "alarm": alarm_data,
        }
        return self._post_json(settings.get("smsApiUrl", ""), payload, settings.get("smsApiKey", ""))

    def _send_call(self, settings: dict, alarm_data: Dict[str, Any], recipients: List[dict]) -> dict:
        payload = {
            "phones": [item["phone"] for item in recipients],
            "alarm": alarm_data,
        }
        return self._post_json(settings.get("callApiUrl", ""), payload, settings.get("callApiKey", ""))

    def _send_email(self, settings: dict, alarm_data: Dict[str, Any], recipients: List[dict]) -> dict:
        server = settings.get("emailServer")
        port = int(settings.get("emailPort") or 587)
        sender = settings.get("emailFrom")
        password = settings.get("emailPassword")
        emails = [item.get("email") for item in recipients if item.get("email")]
        if not server or not sender or not emails:
            return {"success": False, "error": "missing email config or recipients"}
        msg = MIMEText(json.dumps(alarm_data, ensure_ascii=False, indent=2), "plain", "utf-8")
        msg["Subject"] = f"安全告警：{alarm_data.get('alarm_type', '')}"
        msg["From"] = sender
        msg["To"] = ",".join(emails)
        with smtplib.SMTP(server, port, timeout=10) as smtp:
            smtp.starttls()
            if password:
                smtp.login(sender, password)
            smtp.sendmail(sender, emails, msg.as_string())
        return {"success": True, "count": len(emails)}

    async def send_alarm_notification(self, alarm_data: Dict[str, Any], recipients: List[dict] = None):
        settings = get_system_settings()
        severity = str(alarm_data.get("severity") or "medium")
        severity_key = self._severity_key(severity)
        recipients = self._enabled_recipients(recipients or settings.get("notificationRecipients", []), severity)
        results = {"success": True, "channels": {}}

        if not recipients:
            return {"success": False, "message": "no enabled recipients"}

        channel_plan = [
            ("sms", settings.get("smsNotification") and settings.get(f"notify{severity_key}BySms")),
            ("call", settings.get("callNotification") and settings.get(f"notify{severity_key}ByCall")),
            ("email", settings.get("emailNotification")),
        ]

        for channel, enabled in channel_plan:
            if not enabled:
                continue
            try:
                if channel == "sms":
                    results["channels"][channel] = self._send_sms(settings, alarm_data, recipients)
                elif channel == "call":
                    results["channels"][channel] = self._send_call(settings, alarm_data, recipients)
                elif channel == "email":
                    results["channels"][channel] = self._send_email(settings, alarm_data, recipients)
            except Exception as exc:
                logger.error(f"{channel} notification failed: {exc}")
                results["success"] = False
                results["channels"][channel] = {"success": False, "error": str(exc)}

        logger.info(f"Alarm notification result: {results}")
        return results

    async def send_system_notification(self, title: str, message: str):
        logger.info(f"System notification: {title} - {message}")
        return {"success": True}

    async def handle_alarm(self, alarm_level: str, alarm_type: str, alarm_message: str, recipients: List[dict]):
        return await self.send_alarm_notification(
            {"severity": alarm_level, "alarm_type": alarm_type, "description": alarm_message},
            recipients,
        )


notification_service = NotificationService()
