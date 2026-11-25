# Install Oh My GAMES! on this Windows PC. Started by "Install on Windows.bat".
#   install.ps1              install or update (safe to re-run)
#   install.ps1 -Uninstall   stop it and remove everything
# Copies the game to %LOCALAPPDATA%\OhMyWords, starts it at every sign-in on port 8788,
# adds an "Oh My GAMES!" shortcut to the desktop and opens the game.
param([switch]$Uninstall)
$ErrorActionPreference = 'Stop'

$Port    = 8788
$Dest    = Join-Path $env:LOCALAPPDATA 'OhMyWords'
$Src     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Oh My GAMES server.lnk'
$Desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Oh My GAMES!.url'
# Shortcut names from before the rename to Oh My GAMES!; removed on install and uninstall.
$OldLinks = @((Join-Path ([Environment]::GetFolderPath('Startup')) 'Oh My WORDS server.lnk'),
              (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Oh My WORDS!.url'))
$Url     = "http://localhost:$Port/"

function Say($msg)  { Write-Host "==> $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "xx $msg" -ForegroundColor Red; exit 1 }

function Stop-Game {
  Get-CimInstance Win32_Process -Filter "Name like 'python%'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*OhMyWords*serve*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
}

if ($Uninstall) {
  Stop-Game
  Remove-Item (@($Startup, $Desktop) + $OldLinks) -Force -ErrorAction SilentlyContinue
  Set-Location $env:TEMP
  Remove-Item $Dest -Recurse -Force -ErrorAction SilentlyContinue
  Say 'Oh My GAMES! has been removed.'
  exit 0
}

# ------------------------------------------------------------------ Python 3.8+
function Find-Python {
  $check = 'import sys; assert sys.version_info >= (3, 8); print(sys.executable)'
  $tries = @(@{ cmd = 'py'; args = @('-3') }, @{ cmd = 'python'; args = @() }, @{ cmd = 'python3'; args = @() })
  foreach ($t in $tries) {
    if (-not (Get-Command $t.cmd -ErrorAction SilentlyContinue)) { continue }
    $a = $t.args
    try {
      $exe = & $t.cmd @a -c $check 2>$null   # the Microsoft Store "python" stub fails here, as it should
      if ($LASTEXITCODE -eq 0 -and $exe) { return ($exe | Select-Object -Last 1).Trim() }
    } catch { }
  }
  $local = Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if ($local) { return $local.FullName }
  return $null
}

$py = Find-Python
if (-not $py) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Say 'Python 3 is needed. Installing it with winget (this can take a minute)...'
    winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    $py = Find-Python
  }
  if (-not $py) {
    Start-Process 'https://www.python.org/downloads/windows/'
    Fail "Python 3 is needed. Install it from the page that just opened (tick 'Add python.exe to PATH'), then run the installer again."
  }
}
$pyw = Join-Path (Split-Path $py) 'pythonw.exe'
if (-not (Test-Path $pyw)) { $pyw = $py }
Say "Using Python at $py"

# ------------------------------------------------------------------ copy the game
Stop-Game
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($busy) {
  $who = (Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue).ProcessName
  Fail "Port $Port is already used by another program ($who)."
}

if ($Src -ne $Dest) {
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  robocopy $Src $Dest /MIR /XF 'Install on Windows.bat' /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Fail "Copying the game into $Dest failed (robocopy code $LASTEXITCODE)." }
}
Get-ChildItem $Dest -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
Remove-Item $OldLinks -Force -ErrorAction SilentlyContinue
Say "Installed into $Dest"

# ------------------------------------------------------------------ start at sign-in + now
$server = Join-Path $Dest 'serve_windows.py'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($Startup)
$lnk.TargetPath = $pyw
$lnk.Arguments = "`"$server`""
$lnk.WorkingDirectory = $Dest
$lnk.WindowStyle = 7
$lnk.Description = 'Runs the Oh My GAMES! game server'
$lnk.Save()

Set-Content -Path $Desktop -Encoding ASCII -Value "[InternetShortcut]`r`nURL=$Url`r`n"

Start-Process -FilePath $pyw -ArgumentList "`"$server`"" -WorkingDirectory $Dest -WindowStyle Hidden
$up = $false
for ($i = 0; $i -lt 20 -and -not $up; $i++) {
  Start-Sleep -Milliseconds 500
  try { Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 2 | Out-Null; $up = $true } catch { }
}
if (-not $up) { Fail "The game didn't start. See $env:TEMP\ohmywords.log" }

Say "Done! Play at  $Url  (it starts by itself every time you sign in)"
$lan = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.PrefixOrigin -in 'Dhcp', 'Manual' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress
if ($lan) { Write-Host "   Phones/tablets on the same Wi-Fi:  http://${lan}:$Port/  (allow Python if Windows Firewall asks)" }
Write-Host "   Uninstall: double-click 'Uninstall Oh My GAMES.bat' in $Dest"
Start-Process $Url
