$body = '{"username":"测试","employeeId":"12345","role":"worker","password":"123456"}'
$resp = Invoke-WebRequest -Uri 'http://localhost:9000/api/personnel/' -Method Post -ContentType 'application/json' -Body $body
Write-Host "Status:" $resp.StatusCode
Write-Host "Content:" $resp.Content