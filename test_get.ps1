$resp = Invoke-WebRequest -Uri 'http://localhost:9000/api/personnel/' -Method Get
Write-Host "Status:" $resp.StatusCode
Write-Host "Content (first 500 chars):" $resp.Content.Substring(0, [Math]::Min(500, $resp.Content.Length))