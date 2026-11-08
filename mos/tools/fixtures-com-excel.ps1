# Bài mẫu Excel làm bằng Excel thật (COM) cho các tiêu chí bổ sung 11/2026 → tools/fixtures-com/<project>.xlsx
# Chạy:  powershell -ExecutionPolicy Bypass -File mos/tools/fixtures-com-excel.ps1
$ErrorActionPreference = 'Stop'
$mos = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'fixtures-com'
New-Item -ItemType Directory -Force $out | Out-Null
$app = New-Object -ComObject Excel.Application
$app.DisplayAlerts = $false

function MainFile($id) {
  $set = Get-Content -Raw -Encoding UTF8 (Join-Path $mos ('data\sets\' + ($id -replace '-p\d+$', '') + '.json')) | ConvertFrom-Json
  $pr = $set.projects | Where-Object { $_.id -eq $id }
  return Join-Path $mos (($pr.files | Where-Object { $_.name -eq $pr.main }).path -replace '/', '\')
}
function Fixture($id, [scriptblock]$work) {
  $dest = Join-Path $out "$id.xlsx"
  Copy-Item -LiteralPath (MainFile $id) $dest -Force
  $wb = $app.Workbooks.Open($dest)
  try { & $work $wb; $wb.Save(); "OK  $id" }
  catch { "ERR $id : $($_.Exception.Message)" }
  finally { $wb.Close($false) }
}

# t1-p1 #2: Inspect Document → Remove All (Document Properties and Personal Information)
Fixture 'excel-t1-p1' { param($wb) $wb.RemoveDocumentInformation(8) }   # xlRDIDocumentProperties
# t1-p3 #5: Go To vùng tên Find_and_Select
Fixture 'excel-t1-p3' { param($wb) $wb.Worksheets('Home').Activate(); $app.Goto('Find_and_Select') }
$app.Quit()
