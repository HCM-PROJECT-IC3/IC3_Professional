# Bài mẫu Word làm bằng Word thật (COM) cho các tiêu chí bổ sung 11/2026 → tools/fixtures-com/<project>.docx
# Chạy:  powershell -ExecutionPolicy Bypass -File mos/tools/fixtures-com-word.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName Microsoft.VisualBasic
$mos = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'fixtures-com'
New-Item -ItemType Directory -Force $out | Out-Null
$app = New-Object -ComObject Word.Application
$app.Visible = $false
$app.DisplayAlerts = 0
$app.Templates.LoadBuildingBlocks()
$bbt = $null
foreach ($t in $app.Templates) { if ($t.Name -like 'Built-In Building Blocks*') { $bbt = $t } }

function MainFile($id) {
  $set = Get-Content -Raw -Encoding UTF8 (Join-Path $mos ('data\sets\' + ($id -replace '-p\d+$', '') + '.json')) | ConvertFrom-Json
  $pr = $set.projects | Where-Object { $_.id -eq $id }
  return Join-Path $mos (($pr.files | Where-Object { $_.name -eq $pr.main }).path -replace '/', '\')
}
$only = if ($args.Count) { $args[0] -split ',' } else { @() }   # chạy lại vài project: fixtures-com-word.ps1 word-t1-p5,word-t8-p4
function Fixture($id, [scriptblock]$work) {
  if ($only.Count -and $only -notcontains $id) { return }
  $dest = Join-Path $out "$id.docx"
  Copy-Item -LiteralPath (MainFile $id) $dest -Force
  $doc = $app.Documents.Open($dest, $false, $false, $false)
  try { & $work $doc; $doc.Save(); "OK  $id" }
  catch { "ERR $id : $($_.Exception.Message) @ $($_.InvocationInfo.ScriptLineNumber)" }
  finally { $doc.Close(0) }
}
# Đoạn văn đầu tiên bắt đầu bằng chữ cho trước (bỏ qua khoảng trắng đầu).
function Para($doc, $start) {
  foreach ($p in $doc.Paragraphs) { if ($p.Range.Text.TrimStart() -like "$start*") { return $p } }
  throw "không thấy đoạn '$start'"
}
# Vùng từ đầu đoạn a đến hết đoạn b.
function Span($doc, $a, $b) { $doc.Range((Para $doc $a).Range.Start, (Para $doc $b).Range.End) }
function BB($type, $name) {
  foreach ($c in 1..$bbt.BuildingBlockTypes.Item($type).Categories.Count) {
    $cat = $bbt.BuildingBlockTypes.Item($type).Categories.Item($c)
    foreach ($i in 1..$cat.BuildingBlocks.Count) { $b = $cat.BuildingBlocks.Item($i); if ($b.Name -eq $name) { return $b } }
  }
  throw "không có building block '$name'"
}
function SetProp($obj, $name, $val) { [Microsoft.VisualBasic.Interaction]::CallByName($obj, $name, [Microsoft.VisualBasic.CallType]::Let, $val) | Out-Null }
function DocProp($doc, $name, $val) {
  $item = [Microsoft.VisualBasic.Interaction]::CallByName($doc.BuiltInDocumentProperties, 'Item', [Microsoft.VisualBasic.CallType]::Get, $name)
  SetProp $item 'Value' $val
}
function ContinueList($d, $from, $a, $b) {   # "Continue Numbering": các mục dùng chung danh sách với mục $from
  (Para $d $from).Range.Select(); $app.Selection.CopyFormat()
  (Span $d $a $b).Select(); $app.Selection.PasteFormat()
}
function SmartArtShape($doc) {
  foreach ($s in $doc.Shapes) { if ($s.HasSmartArt) { return $s } }
  foreach ($s in $doc.InlineShapes) { if ($s.HasSmartArt) { return $s } }
  throw 'không thấy SmartArt'
}

Fixture 'word-t1-p2' { param($d) $d.ActiveWindow.View.Type = 3 }                 # Print Layout
Fixture 'word-t1-p5' { param($d) $d.Sections(1).Headers(1).Range.Delete() | Out-Null }   # trang 1 = trang thứ 2 (trang đầu đánh số 0)
Fixture 'word-t2-p1' { param($d) (BB 4 'Whisp').Insert($d.Sections(1).Footers(1).Range, $true) | Out-Null }
Fixture 'word-t2-p2' { param($d)
  foreach ($s in $d.Shapes) { if ($s.Type -eq 17 -or $s.TextFrame.HasText) { $s.ShapeStyle = 2 } }       # Colored Outline - Blue, Accent 1
}
Fixture 'word-t2-p3' { param($d) $d.Password = 'starship' }
Fixture 'word-t3-p4' { param($d) (Span $d 'Form of ownership' 'Long term').ParagraphFormat.SpaceAfter = 0 }
Fixture 'word-t3-p5' { param($d) (Span $d 'I would like' 'Please keep in touch').ParagraphFormat.Alignment = 3 }
Fixture 'word-t4-p1' { param($d)
  $r = Span $d 'Hiring forms' 'When it will'
  $tpl = $app.ListGalleries.Item(2).ListTemplates.Item(1)                          # thư viện Numbering
  $lv = $tpl.ListLevels.Item(1); $lv.NumberStyle = 1; $lv.NumberFormat = '%1.'      # wdListNumberStyleUppercaseRoman
  $r.ListFormat.ApplyListTemplate($tpl, $false, 0)
  ContinueList $d 'Union relations' 'Hiring forms' 'Hiring forms'                # mục đầu đôi khi bị bỏ sót → nối vào danh sách
  (BB 10 'Banded Quote').Insert((Para $d 'Bonus:').Range.Characters.First, $true) | Out-Null
}
Fixture 'word-t5-p1' { param($d)
  (Para $d 'Note: Slow devices').OutlineLevel = 5
  foreach ($p in $d.Paragraphs) { if ($p.Range.Text.StartsWith('Note:')) { $p.LeftIndent = $p.LeftIndent + 36; $p.FirstLineIndent = -36 } }
  (Span $d 'Define 10 Mbps' 'Identify the different').ListFormat.ListIndent()
  (BB 4 'Facet (Odd Page)').Insert($d.Sections(1).Footers(1).Range, $true) | Out-Null
  foreach ($s in $d.Sections) { $s.PageSetup.FooterDistance = 0.3 * 72 }
  $d.ActiveWindow.View.Type = 2                                                    # giữ Outline
}
Fixture 'word-t5-p2' { param($d)
  $t = $null; foreach ($x in $d.Tables) { if ($x.Range.Text -match 'Total|Category|Sales') { $t = $x } }
  "  table rows=$($t.Rows.Count) cols=$($t.Columns.Count) last='$($t.Rows($t.Rows.Count).Range.Text)'" | Write-Host
  $t.Cell($t.Rows.Count, 2).Formula('=SUM(ABOVE)')
}
Fixture 'word-t7-p1' { param($d) $a = Para $d 'The study of the history'; $b = Para $d 'Dinosaurs lived throughout'
  $a.Range.Select(); $app.Selection.CopyFormat(); $b.Range.Select(); $app.Selection.PasteFormat() }
Fixture 'word-t10-p1' { param($d) $a = Para $d 'The study of the history'; $b = Para $d 'Dinosaurs lived throughout'
  $a.Range.Select(); $app.Selection.CopyFormat(); $b.Range.Select(); $app.Selection.PasteFormat() }
Fixture 'word-t7-p2' { param($d)
  ContinueList $d 'Chocolate chocolate-chip' 'Apple cinnamon' 'Streusel topped'
  $sa = SmartArtShape $d; foreach ($n in $sa.SmartArt.AllNodes) { $n.Shapes.Item(1).ThreeD.BevelTopType = 7 }
}
Fixture 'word-t10-p2' { param($d)
  ContinueList $d 'Chocolate chocolate-chip' 'Apple cinnamon' 'Streusel topped'
  $sa = SmartArtShape $d; foreach ($n in $sa.SmartArt.AllNodes) { $n.Shapes.Item(1).ThreeD.BevelTopType = 7 }
}
Fixture 'word-t9-p7' { param($d) $sa = SmartArtShape $d; foreach ($n in $sa.SmartArt.AllNodes) { $n.Shapes.Item(1).ThreeD.BevelTopType = 2 } }
Fixture 'word-t7-p3' { param($d)
  (Span $d 'Open account' 'Deposit Fee').ConvertToTable(1, 5, 2) | Out-Null          # tab, 5 hàng, 2 cột
  foreach ($c in $d.Comments) { if ($c.Scope.Text -match 'Aloha') { $c.Delete() } }
}
Fixture 'word-t10-p3' { param($d)
  $first = Para $d 'Monthly maintenance'; $last = $first; $n = 1
  while ($last.Next() -and $last.Next().Range.Text -match "`t") { $last = $last.Next(); $n++ }
  $d.Range($first.Range.Start, $last.Range.End).ConvertToTable(1, $n, 2) | Out-Null
  foreach ($c in $d.Comments) { if ($c.Scope.Text -match '5,?000') { $c.Delete() } }
}
Fixture 'word-t7-p4' { param($d)
  $d.ApplyQuickStyleSet2('Casual')
  foreach ($r in @($d.Revisions)) { if ($r.Type -eq 1 -or $r.Type -eq 2) { $r.Accept() } }
  foreach ($r in @($d.Revisions)) { $r.Reject() }
}
Fixture 'word-t10-p5' { param($d)
  $d.ApplyQuickStyleSet2('Centered')
  foreach ($r in @($d.Revisions)) { if ($r.Type -eq 1 -or $r.Type -eq 2) { $r.Accept() } }
  foreach ($r in @($d.Revisions)) { $r.Reject() }
}
Fixture 'word-t8-p2' { param($d) $d.ApplyQuickStyleSet2('Lines (Simple)') }
Fixture 'word-t10-p4' { param($d)
  $d.RemoveDocumentInformation(8)
  DocProp $d 'Company' 'Contoso'
  (Para $d 'Considering the responses').Range.Select(); $app.Selection.ClearFormatting()
  $d.ApplyQuickStyleSet2('Minimalist')
}
Fixture 'word-t8-p4' { param($d)
  # Danh sách nằm trong hộp văn bản: Format Painter từ danh sách bullet vuông sang danh sách Ski resorts.
  $src = $null; $a = $null; $b = $null
  $story = $d.StoryRanges.Item(5)
  while ($story) {
    foreach ($p in $story.Paragraphs) { $t = $p.Range.Text.Trim()
      if (-not $src -and $t -like 'Park City*') { $src = $p }; if (-not $a -and $t -like 'Alta Ski Area*') { $a = $p }; if (-not $b -and $t -like 'Deer Valley Resort*') { $b = $p } }
    $story = $story.NextStoryRange
  }
  $r = $a.Range; $r.SetRange($a.Range.Start, $b.Range.End)
  $r.ListFormat.ApplyListTemplate($src.Range.ListFormat.ListTemplate, $false, 0)
}
Fixture 'word-t8-p5' { param($d)
  # Chuyển đoạn chứa SmartArt (trang 2) lên giữa tiêu đề và mục "Code of Ethics" — như Ctrl+X / Ctrl+V.
  $sa = SmartArtShape $d
  $src = if ($sa.Anchor) { $sa.Anchor.Paragraphs(1).Range } else { $sa.Range.Paragraphs(1).Range }
  "  smartart inline=$(-not $sa.Anchor) srcStart=$($src.Start)" | Write-Host
  $target = Para $d 'Code of Ethics'
  $dst = $d.Range($target.Range.Start, $target.Range.Start)
  $dst.FormattedText = $src.FormattedText
  $src.Delete() | Out-Null
}
Fixture 'word-t8-p6' { param($d) $d.Tables(1).AutoFitBehavior(1) }                  # wdAutoFitContent
Fixture 'word-t9-p2' { param($d)
  $r = (Para $d 'Back up your files').Range
  $r.ListFormat.ApplyListTemplate($r.ListFormat.ListTemplate, $false, 2)          # mục đầu bắt đầu lại từ 1
  ContinueList $d 'Back up your files' 'Clean your monitor' 'Avoid extreme'       # 4 mục sau nối theo mục đầu
}
Fixture 'word-t9-p3' { param($d) ContinueList $d 'Sports, Sports' 'Gone Fishing' 'Cars on Mars' }
# t9-p5 #1: Format Painter từ "Vol 5 Issue 1" sang ngày ở góc đối diện (cả hai nằm trong hộp văn bản)
Fixture 'word-t9-p5' { param($d)
  $src = $null; $dst = $null
  $story = $d.StoryRanges.Item(5)                                                  # wdTextFrameStory: chữ trong mọi hộp văn bản
  while ($story) {
    foreach ($p in $story.Paragraphs) { $t = $p.Range.Text.Trim(); if (-not $src -and $t -like 'Vol 5 Issue 1*') { $src = $p }; if (-not $dst -and $p.Range.Fields.Count -gt 0) { $dst = $p } }
    $story = $story.NextStoryRange
  }
  "  src=$([bool]$src) dst=$([bool]$dst)" | Write-Host
  # Kết quả của Format Painter: chữ ngày mang đúng định dạng ký tự của "Vol 5 Issue 1" (khác nhau ở in nghiêng).
  $f = $src.Range.Characters(1).Font
  $r = $dst.Range; $r.Font.Bold = $f.Bold; $r.Font.Italic = $f.Italic; $r.Font.Color = $f.Color; $r.Font.Size = $f.Size
}
$app.Quit()
