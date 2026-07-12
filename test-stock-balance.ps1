$ErrorActionPreference = "Stop"

$baseUrl = "https://erp-api.nsd.md/novotech/odata/standard.odata"

$credential = Get-Credential `
  -UserName "workspace_api" `
  -Message "Введите пароль 1C OData"

$user = $credential.UserName
$password = $credential.GetNetworkCredential().Password

$token = [Convert]::ToBase64String(
  [Text.Encoding]::UTF8.GetBytes("${user}:${password}")
)

$headers = @{
  Authorization = "Basic $token"
  Accept = "application/json"
}

$tests = @(
  @{
    Name = "ЗапасыНаСкладах Balance"
    Url  = "$baseUrl/AccumulationRegister_%D0%97%D0%B0%D0%BF%D0%B0%D1%81%D1%8B%D0%9D%D0%B0%D0%A1%D0%BA%D0%BB%D0%B0%D0%B4%D0%B0%D1%85/Balance(Condition='',Dimensions='',Period=datetime'2026-07-12T23:59:59')?`$top=10&`$format=json"
  },
  @{
    Name = "ЗапасыКРасходуСоСкладов Balance"
    Url  = "$baseUrl/AccumulationRegister_%D0%97%D0%B0%D0%BF%D0%B0%D1%81%D1%8B%D0%9A%D0%A0%D0%B0%D1%81%D1%85%D0%BE%D0%B4%D1%83%D0%A1%D0%BE%D0%A1%D0%BA%D0%BB%D0%B0%D0%B4%D0%BE%D0%B2/Balance(Condition='',Dimensions='',Period=datetime'2026-07-12T23:59:59')?`$top=10&`$format=json"
  },
  @{
    Name = "ЗапасыКПоступлениюНаСклады Balance"
    Url  = "$baseUrl/AccumulationRegister_%D0%97%D0%B0%D0%BF%D0%B0%D1%81%D1%8B%D0%9A%D0%9F%D0%BE%D1%81%D1%82%D1%83%D0%BF%D0%BB%D0%B5%D0%BD%D0%B8%D1%8E%D0%9D%D0%B0%D0%A1%D0%BA%D0%BB%D0%B0%D0%B4%D1%8B/Balance(Condition='',Dimensions='',Period=datetime'2026-07-12T23:59:59')?`$top=10&`$format=json"
  }
)

foreach ($test in $tests) {
  Write-Host ""
  Write-Host "=== $($test.Name) ===" -ForegroundColor Yellow

  try {
    $result = Invoke-RestMethod `
      -Method Get `
      -Uri $test.Url `
      -Headers $headers

    Write-Host "Rows: $(@($result.value).Count)" -ForegroundColor Green

    $result.value |
      ConvertTo-Json -Depth 8
  }
  catch {
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host $_.Exception.Message

    if ($_.ErrorDetails.Message) {
      Write-Host $_.ErrorDetails.Message
    }
  }
}