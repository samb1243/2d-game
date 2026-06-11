param([string]$page = "harness.html")   # pass "loadcheck.html" to run the boot/regression check

Add-Type -AssemblyName System.Web       # HttpUtility isn't loaded by default in PowerShell 5.1
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$url = "file:///C:/Users/kishi/OneDrive/Documents/GitHub/Sithuli-game/test/$page"
$tmp = "$env:TEMP\gemrush_dump.html"
& $chrome --headless=new --disable-gpu --no-sandbox --dump-dom $url 2>$null | Out-File -Encoding utf8 $tmp
$c = Get-Content $tmp -Raw
$m = [regex]::Match($c, '(?s)<pre id="out">(.*?)</pre>')
if ($m.Success) { [System.Web.HttpUtility]::HtmlDecode($m.Groups[1].Value) } else { Write-Output "NO OUTPUT - dump bytes: $($c.Length)" }
