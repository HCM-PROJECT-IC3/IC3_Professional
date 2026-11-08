# Bài mẫu PowerPoint làm bằng PowerPoint thật (COM) cho các tiêu chí bổ sung 11/2026 → tools/fixtures-com/<project>.pptx
# Chạy:  powershell -ExecutionPolicy Bypass -File mos/tools/fixtures-com-ppt.ps1
# Cần Microsoft PowerPoint trên máy. Mỗi project chỉ làm các task ghi trong fixtures-com/manifest.json.
$ErrorActionPreference = 'Stop'
$mos = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'fixtures-com'
New-Item -ItemType Directory -Force $out | Out-Null
$app = New-Object -ComObject PowerPoint.Application

# Tệp đề của project lấy từ data/sets/<bộ đề>.json (tên tệp mỗi project một kiểu).
function MainFile($id) {
  $set = Get-Content -Raw -Encoding UTF8 (Join-Path $mos ('data\sets\' + ($id -replace '-p\d+$', '') + '.json')) | ConvertFrom-Json
  $pr = $set.projects | Where-Object { $_.id -eq $id }
  return Join-Path $mos (($pr.files | Where-Object { $_.name -eq $pr.main }).path -replace '/', '\')
}
function Fixture($id, [scriptblock]$work) {
  $dest = Join-Path $out "$id.pptx"
  Copy-Item -LiteralPath (MainFile $id) $dest -Force
  $pres = $app.Presentations.Open($dest, 0, 0, 0)
  try { & $work $pres; $pres.Save(); "OK  $id" }
  catch { "ERR $id : $($_.Exception.Message)" }
  finally { $pres.Close() }
}
function SlideWith($pres, $text) {
  foreach ($s in $pres.Slides) { foreach ($sh in $s.Shapes) { if ($sh.HasTextFrame -and $sh.TextFrame.TextRange.Text -match $text) { return $s } } }
  throw "không thấy trang chiếu có '$text'"
}
function Model3D($slide) {
  foreach ($sh in $slide.Shapes) { if ($sh.Type -eq 30) { return $sh } }
  throw "không thấy mô hình 3D"
}
# Cắt cạnh dưới (khung cắt) để ảnh có cạnh trên/dưới như ảnh mẫu, giữ nguyên chiều rộng.
function CropTo($pic, $ref) {
  $c = $pic.PictureFormat.Crop
  $c.ShapeHeight = ($ref.Top + $ref.Height) - $pic.Top
  $c.ShapeTop = $ref.Top
}
# Một số thuộc tính COM PowerShell không gán trực tiếp được → gọi kiểu late-binding.
function SetProp($obj, $name, $val) { [void][System.__ComObject].InvokeMember($name, 'SetProperty', $null, $obj, @($val)) }
function GetProp($obj, $name, $arg) { return [System.__ComObject].InvokeMember($name, 'GetProperty', $null, $obj, @($arg)) }
function Turn($m) { $m.Model3D.RotationX = $m.Model3D.RotationX + 25; $m.Model3D.RotationY = $m.Model3D.RotationY + 35 }

# t1-p3 #3: kiểu Moderate Effect - Orange, Accent 4 + bóng Inside Bottom Right + đưa lên trên cùng
Fixture 'ppt-t1-p3' {
  param($p)
  $sun = $p.Slides(5).Shapes('Sun 3')
  $sun.ShapeStyle = 33
  $sun.Shadow.Visible = -1
  $sun.Shadow.Style = 1          # msoShadowStyleInnerShadow
  $sun.Shadow.OffsetX = 3; $sun.Shadow.OffsetY = 3
  $sun.ZOrder(0)                 # msoBringToFront
}
# t1-p4 #6: ghi hình từ trang chiếu 3 → mỗi trang chiếu từ 3 có thời gian chuyển trang
Fixture 'ppt-t1-p4' {
  param($p)
  for ($i = 3; $i -le $p.Slides.Count; $i++) { $t = $p.Slides($i).SlideShowTransition; $t.AdvanceOnTime = -1; $t.AdvanceTime = 4 }
}
# t1-p5 #4: mã hoá bằng mật khẩu
Fixture 'ppt-t1-p5' { param($p) $p.Password = 'ForMOS' }
# t2-p6 #2: mục liệt kê xuất hiện From Bottom-Right; #5: hiệu ứng cho mô hình 3D, After Previous
Fixture 'ppt-t2-p6' {
  param($p)
  foreach ($e in $p.Slides(2).TimeLine.MainSequence) { $e.EffectParameters.Direction = 14 }
  $m = Model3D $p.Slides(5)
  $p.Slides(5).TimeLine.MainSequence.AddEffect($m, 10, 0, 3) | Out-Null   # Fade, After Previous (Turntable không có trong COM)
}
# t2-p7 #2: logo trên Slide Master, cạnh trên = khung nội dung, cạnh phải = khung số trang
Fixture 'ppt-t2-p7' {
  param($p)
  $ms = $p.SlideMaster.Shapes
  $body = $null; $num = $null
  foreach ($sh in $ms) { if ($sh.Type -eq 14) { if ($sh.PlaceholderFormat.Type -eq 2) { $body = $sh }; if ($sh.PlaceholderFormat.Type -eq 13) { $num = $sh } } }
  $pic = $ms.AddPicture((Join-Path (Split-Path (MainFile 'ppt-t2-p7')) 'LogoIIG.jpg'), 0, -1, 0, 0)
  $pic.Top = $body.Top
  $pic.Left = $num.Left + $num.Width - $pic.Width
}
# t3-p6 #1: cắt video — khung hiển thị Left 6.5", Width 4.4"
Fixture 'ppt-t3-p6' {
  param($p)
  $v = $null
  foreach ($sh in $p.Slides(3).Shapes) { if ($sh.Type -eq 16 -or $sh.Type -eq 14 -and $sh.MediaType) { $v = $sh } }
  if (-not $v) { foreach ($sh in $p.Slides(3).Shapes) { if ($sh.Name -eq 'DOCUMENTARY INTRO') { $v = $sh } } }
  $v.PictureFormat.Crop.ShapeLeft = 6.5 * 72
  $v.PictureFormat.Crop.ShapeWidth = 4.4 * 72
}
# 3D Model Views (+ kích thước)
Fixture 'ppt-t4-p2' { param($p) $m = Model3D $p.Slides($p.Slides.Count); Turn $m; $m.LockAspectRatio = -1; $m.Height = 4 * 72 }
Fixture 'ppt-t6-p1' { param($p) $m = Model3D $p.Slides(5); Turn $m; $m.LockAspectRatio = -1; $m.Height = 6 * 72 }
Fixture 'ppt-t7-p2' { param($p) Turn (Model3D $p.Slides(7)) }
Fixture 'ppt-t8-p5' { param($p) Turn (Model3D $p.Slides($p.Slides.Count)) }
# t4-p6 #3 cắt đáy ảnh Natural greening cho bằng 2 ảnh kia; #5 góc nhìn mô hình 3D trang "Introduction"
Fixture 'ppt-t4-p6' {
  param($p)
  $s = SlideWith $p 'Natural greening'
  CropTo $s.Shapes('Picture 12') $s.Shapes('Freeform 12')
  Turn (Model3D (SlideWith $p 'Introduction'))
}
# t5-p1 #6: tiêu đề trang chiếu 3 màu Blue, Accent 2, giãn ký tự 1pt
Fixture 'ppt-t5-p1' {
  param($p)
  foreach ($sh in $p.Slides(3).Shapes) { if ($sh.HasTextFrame -and $sh.TextFrame.TextRange.Text -match 'Study music theory') {
    $r = $sh.TextFrame2.TextRange; $r.Font.Fill.ForeColor.ObjectThemeColor = 6; $r.Font.Spacing = 1 } }
}
# t5-p4 #2: cắt đáy ảnh Sunset and Sea cho bằng ảnh khác
Fixture 'ppt-t5-p4' {
  param($p)
  CropTo $p.Slides(5).Shapes('Picture 2') $p.Slides(5).Shapes('Picture Placeholder 568')
}
# t7-p5 #5: cắt đáy ảnh Classroom (Picture 6) cho bằng ảnh Students (Picture 4)
Fixture 'ppt-t7-p5' {
  param($p)
  CropTo $p.Slides(3).Shapes('Picture 6') $p.Slides(3).Shapes('Picture 4')
}
# t7-p6 #2 Company = iig; #5 góc nhìn mô hình 3D trang chiếu 4, rộng 3.5"
Fixture 'ppt-t7-p6' {
  param($p)
  SetProp (GetProp $p.BuiltInDocumentProperties 'Item' 'Company') 'Value' 'iig'
  $m = Model3D $p.Slides(4); Turn $m; $m.LockAspectRatio = -1; $m.Width = 3.5 * 72
}
# t10-p4 #1: chuyển cảnh Cube cho cả 4 trang chiếu
Fixture 'ppt-t10-p4' {
  param($p)
  foreach ($s in $p.Slides) { $s.SlideShowTransition.EntryEffect = 3914 }
}
$app.Quit()
