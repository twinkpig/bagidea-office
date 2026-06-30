$ErrorActionPreference = "Stop"

$logPath = Join-Path $PSScriptRoot "wallpaper-repin.log"
function Write-RepinLog([string]$message) {
  try {
    Add-Content -Path $logPath -Value ("{0} {1}" -f (Get-Date -Format o), $message)
  } catch {}
}

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($false, "BagIdeaOfficeWallpaperRepin", [ref]$createdNew)
if (-not $createdNew) {
  Write-RepinLog "already running"
  exit 0
}

try {
  Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class BagIdeaWallpaperWin {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

  [DllImport("user32.dll")]
  public static extern IntPtr GetShellWindow();

  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern IntPtr FindWindowEx(IntPtr hWndParent, IntPtr hWndChildAfter, string lpszClass, string lpszWindow);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

  [DllImport("user32.dll")]
  public static extern IntPtr GetParent(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern int SetWindowRgn(IntPtr hWnd, IntPtr hRgn, bool bRedraw);

  [DllImport("user32.dll")]
  public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);

  [DllImport("user32.dll")]
  public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);

  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

  [DllImport("user32.dll")]
  public static extern int GetSystemMetrics(int nIndex);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, IntPtr lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);

  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MONITORINFO {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
  }

  public struct MonitorRect {
    public int Left;
    public int Top;
    public int Width;
    public int Height;
    public bool Primary;
  }

  private static List<MonitorRect> monitors;

  private static bool MonitorCallback(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData) {
    MONITORINFO info = new MONITORINFO();
    info.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
    if (GetMonitorInfo(hMonitor, ref info)) {
      RECT r = info.rcMonitor;
      monitors.Add(new MonitorRect {
        Left = r.Left,
        Top = r.Top,
        Width = r.Right - r.Left,
        Height = r.Bottom - r.Top,
        Primary = (info.dwFlags & 1) != 0
      });
    }
    return true;
  }

  public static MonitorRect[] GetMonitors() {
    monitors = new List<MonitorRect>();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, MonitorCallback, IntPtr.Zero);
    monitors.Sort(delegate(MonitorRect a, MonitorRect b) {
      if (a.Primary == b.Primary) return 0;
      return a.Primary ? -1 : 1;
    });
    return monitors.ToArray();
  }

  public static void SetWindowBits(IntPtr hWnd, int index, uint addBits, uint removeBits) {
    unchecked {
      uint bits = (uint)GetWindowLong(hWnd, index);
      bits = (bits | addBits) & ~removeBits;
      SetWindowLong(hWnd, index, (int)bits);
    }
  }
}
"@

  [void][BagIdeaWallpaperWin]::SetProcessDPIAware()
  Write-RepinLog "started"

  function Get-ClassName([IntPtr]$h) {
    $b = New-Object Text.StringBuilder 128
    [void][BagIdeaWallpaperWin]::GetClassName($h, $b, 128)
    $b.ToString()
  }

  function Get-Title([IntPtr]$h) {
    $b = New-Object Text.StringBuilder 160
    [void][BagIdeaWallpaperWin]::GetWindowText($h, $b, 160)
    $b.ToString()
  }

  function Convert-HexUInt32([string]$hex) {
    return [Convert]::ToUInt32($hex, 16)
  }

  function Join-WindowBits([uint32[]]$bits) {
    [uint64]$value = 0
    foreach ($bit in $bits) {
      $value = $value -bor [uint64]$bit
    }
    return [uint32]$value
  }

  function Get-WindowRectInfo([IntPtr]$h) {
    if ($h -eq [IntPtr]::Zero) { return $null }
    $rect = New-Object BagIdeaWallpaperWin+RECT
    if (-not [BagIdeaWallpaperWin]::GetWindowRect($h, [ref]$rect)) { return $null }
    return @{
      Left = [int]$rect.Left
      Top = [int]$rect.Top
      Right = [int]$rect.Right
      Bottom = [int]$rect.Bottom
      Width = [int]($rect.Right - $rect.Left)
      Height = [int]($rect.Bottom - $rect.Top)
    }
  }

  function Test-WallpaperParentCandidate([IntPtr]$h) {
    if ($h -eq [IntPtr]::Zero) { return $false }
    if (-not [BagIdeaWallpaperWin]::IsWindow($h)) { return $false }
    if ((Get-ClassName $h) -ne "WorkerW") { return $false }

    $rect = Get-WindowRectInfo $h
    if (-not $rect) { return $false }

    # Tiny hidden WorkerW windows are common. Only use a real desktop-sized
    # WorkerW so the office can be a child without becoming a foreground layer.
    return ($rect.Width -ge 400 -and $rect.Height -ge 300)
  }

  $script:officeProcessIdCache = 0
  $script:lastPinnedKey = ""

  function Get-OfficeWallpaperProcessId {
    if ($script:officeProcessIdCache -gt 0) {
      $p = Get-Process -Id $script:officeProcessIdCache -ErrorAction SilentlyContinue
      if ($p) { return [uint32]$script:officeProcessIdCache }
      $script:officeProcessIdCache = 0
    }

    $proc = Get-CimInstance Win32_Process -Filter "Name = 'BagIdeaOffice.exe'" |
      Where-Object { $_.CommandLine -match "--wallpaper" } |
      Sort-Object CreationDate -Descending |
      Select-Object -First 1
    if (-not $proc) {
      $proc = Get-CimInstance Win32_Process -Filter "Name = 'BagIdeaOffice.exe'" |
        Sort-Object CreationDate -Descending |
        Select-Object -First 1
    }
    if (-not $proc) { return 0 }
    $script:officeProcessIdCache = [uint32]$proc.ProcessId
    return [uint32]$script:officeProcessIdCache
  }

  function Find-EngineWindow {
    $officeProcessId = Get-OfficeWallpaperProcessId
    if ($officeProcessId -eq 0) { return [IntPtr]::Zero }

    $script:engine = [IntPtr]::Zero
    $seen = New-Object "System.Collections.Generic.HashSet[Int64]"

    function Visit([IntPtr]$h) {
      if ($h -eq [IntPtr]::Zero) { return }
      if (-not [BagIdeaWallpaperWin]::IsWindow($h)) { return }
      if (-not $seen.Add($h.ToInt64())) { return }

      $windowProcessId = 0
      [void][BagIdeaWallpaperWin]::GetWindowThreadProcessId($h, [ref]$windowProcessId)
      if ($windowProcessId -eq $officeProcessId) {
        $class = Get-ClassName $h
        $title = Get-Title $h
        if ($class -eq "Engine" -or $title -like "*BagIdea*") {
          if ($script:engine -eq [IntPtr]::Zero -or $class -eq "Engine") {
            $script:engine = $h
          }
        }
      }

      [void][BagIdeaWallpaperWin]::EnumChildWindows($h, {
        param($child, $lp)
        Visit $child
        return $true
      }, [IntPtr]::Zero)
    }

    [void][BagIdeaWallpaperWin]::EnumWindows({
      param($h, $lp)
      Visit $h
      return $true
    }, [IntPtr]::Zero)

    return $script:engine
  }

  function Find-DesktopParent {
    $progman = Find-ProgmanWindow
    if ($progman -ne [IntPtr]::Zero) {
      $result = [UIntPtr]::Zero
      [void][BagIdeaWallpaperWin]::SendMessageTimeout($progman, 0x052C, [UIntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$result)
    }

    $script:iconWorker = [IntPtr]::Zero
    $script:wallWorker = [IntPtr]::Zero
    [void][BagIdeaWallpaperWin]::EnumWindows({
      param($h, $lp)
      if ((Get-ClassName $h) -eq "WorkerW") {
        $defView = [BagIdeaWallpaperWin]::FindWindowEx($h, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
        if ($defView -ne [IntPtr]::Zero) {
          $script:iconWorker = $h
          $script:wallWorker = [BagIdeaWallpaperWin]::FindWindowEx([IntPtr]::Zero, $h, "WorkerW", $null)
        }
      }
      return $true
    }, [IntPtr]::Zero)

    # Preferred Explorer layout: icons live in one top-level WorkerW and the
    # wallpaper can be parented to the next desktop-sized WorkerW behind it.
    if (Test-WallpaperParentCandidate $script:wallWorker) { return $script:wallWorker }

    return [IntPtr]::Zero
  }

  function Find-ProgmanWindow {
    $progman = [BagIdeaWallpaperWin]::FindWindow("Progman", $null)
    if ($progman -eq [IntPtr]::Zero) {
      $shell = [BagIdeaWallpaperWin]::GetShellWindow()
      if ($shell -ne [IntPtr]::Zero -and (Get-ClassName $shell) -eq "Progman") {
        $progman = $shell
      }
    }
    if ($progman -ne [IntPtr]::Zero) {
      $result = [UIntPtr]::Zero
      [void][BagIdeaWallpaperWin]::SendMessageTimeout($progman, 0x052C, [UIntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$result)
    }
    return $progman
  }

  function Get-MonitorIndex {
    $monitorFile = Join-Path $PSScriptRoot "monitor.txt"
    if (Test-Path $monitorFile) {
      $txt = (Get-Content $monitorFile -Raw).Trim()
      $idx = 0
      if ([int]::TryParse($txt, [ref]$idx) -and $idx -ge 0) { return $idx }
    }
    $envIdx = $env:BAGIDEA_MONITOR
    $parsed = 0
    if ([int]::TryParse($envIdx, [ref]$parsed) -and $parsed -ge 0) { return $parsed }
    return 0
  }

  function Get-TargetPlacement([IntPtr]$parent) {
    $monitors = [BagIdeaWallpaperWin]::GetMonitors()
    if ($monitors.Length -gt 0) {
      try { Set-Content -Path (Join-Path $PSScriptRoot "monitors.txt") -Value ([string]$monitors.Length) } catch {}
    }
    $idx = Get-MonitorIndex
    if ($idx -ge $monitors.Length) { $idx = 0 }

    $parentRect = New-Object BagIdeaWallpaperWin+RECT
    [void][BagIdeaWallpaperWin]::GetWindowRect($parent, [ref]$parentRect)

    if ($monitors.Length -gt 0) {
      $m = $monitors[$idx]
      return @{
        X = [int]($m.Left - $parentRect.Left)
        Y = [int]($m.Top - $parentRect.Top)
        W = [int]$m.Width
        H = [int]$m.Height
        Monitor = [int]$idx
      }
    }

    $w = [Math]::Max(1, $parentRect.Right - $parentRect.Left)
    $h = [Math]::Max(1, $parentRect.Bottom - $parentRect.Top)
    return @{ X = 0; Y = 0; W = $w; H = $h; Monitor = -1 }
  }

  function Get-OverlayPlacement {
    $monitors = [BagIdeaWallpaperWin]::GetMonitors()
    if ($monitors.Length -gt 0) {
      try { Set-Content -Path (Join-Path $PSScriptRoot "monitors.txt") -Value ([string]$monitors.Length) } catch {}
    }
    $idx = Get-MonitorIndex
    if ($idx -ge $monitors.Length) { $idx = 0 }

    if ($monitors.Length -gt 0) {
      $m = $monitors[$idx]
      return @{
        X = [int]$m.Left
        Y = [int]$m.Top
        W = [int]$m.Width
        H = [int]$m.Height
        Monitor = [int]$idx
      }
    }

    return @{
      X = [BagIdeaWallpaperWin]::GetSystemMetrics(76)
      Y = [BagIdeaWallpaperWin]::GetSystemMetrics(77)
      W = [BagIdeaWallpaperWin]::GetSystemMetrics(78)
      H = [BagIdeaWallpaperWin]::GetSystemMetrics(79)
      Monitor = -1
    }
  }

  function Pin-OfficeWindow([IntPtr]$engine, [IntPtr]$desktopParent) {
    if ($engine -eq [IntPtr]::Zero -or $desktopParent -eq [IntPtr]::Zero) { return }

    $GWL_STYLE = -16
    $GWL_EXSTYLE = -20
    $WS_CHILD = [uint32]0x40000000
    $WS_POPUP = Convert-HexUInt32 "80000000"
    $WS_VISIBLE = [uint32]0x10000000
    $WS_EX_APPWINDOW = [uint32]0x00040000
    $WS_EX_TOOLWINDOW = [uint32]0x00000080
    $WS_EX_NOACTIVATE = [uint32]0x08000000
    $WS_EX_TRANSPARENT = [uint32]0x00000020
    $HWND_BOTTOM = [IntPtr]1
    $SW_RESTORE = 9
    $SW_SHOWNA = 8
    $SWP_FRAMECHANGED = [uint32]0x0020
    $SWP_NOACTIVATE = [uint32]0x0010
    $SWP_SHOWWINDOW = [uint32]0x0040

    [BagIdeaWallpaperWin]::SetWindowBits($engine, $GWL_STYLE, (Join-WindowBits @($WS_CHILD, $WS_VISIBLE)), $WS_POPUP)
    [BagIdeaWallpaperWin]::SetWindowBits(
      $engine, $GWL_EXSTYLE,
      (Join-WindowBits @($WS_EX_TOOLWINDOW, $WS_EX_NOACTIVATE, $WS_EX_TRANSPARENT)),
      $WS_EX_APPWINDOW)
    [void][BagIdeaWallpaperWin]::SetWindowRgn($engine, [IntPtr]::Zero, $true)

    if ([BagIdeaWallpaperWin]::GetParent($engine) -ne $desktopParent) {
      [void][BagIdeaWallpaperWin]::SetParent($engine, $desktopParent)
    }

    $placement = Get-TargetPlacement $desktopParent
    [void][BagIdeaWallpaperWin]::ShowWindow($engine, $SW_RESTORE)
    [void][BagIdeaWallpaperWin]::ShowWindow($engine, $SW_SHOWNA)
    [void][BagIdeaWallpaperWin]::MoveWindow(
      $engine, [int]$placement.X, [int]$placement.Y, [int]$placement.W, [int]$placement.H, $true)
    [void][BagIdeaWallpaperWin]::SetWindowPos(
      $engine,
      $HWND_BOTTOM,
      [int]$placement.X,
      [int]$placement.Y,
      [int]$placement.W,
      [int]$placement.H,
      (Join-WindowBits @($SWP_FRAMECHANGED, $SWP_NOACTIVATE, $SWP_SHOWWINDOW)))

    $pinKey = "child:{0}:{1}:{2}:{3}:{4}:{5}" -f $desktopParent.ToInt64(), $placement.Monitor, $placement.X, $placement.Y, $placement.W, $placement.H
    if ($script:lastPinnedKey -ne $pinKey) {
      $script:lastPinnedKey = $pinKey
      Write-RepinLog ("pinned engine={0} parent={1} parentClass={2} monitor={3} rect={4},{5},{6},{7}" -f $engine.ToInt64(), $desktopParent.ToInt64(), (Get-ClassName $desktopParent), $placement.Monitor, $placement.X, $placement.Y, $placement.W, $placement.H)
    }
  }

  function Pin-OfficeOverlayWindow([IntPtr]$engine, [IntPtr]$progman) {
    if ($engine -eq [IntPtr]::Zero -or $progman -eq [IntPtr]::Zero) { return }

    $GWL_STYLE = -16
    $GWL_EXSTYLE = -20
    $WS_CHILD = [uint32]0x40000000
    $WS_POPUP = Convert-HexUInt32 "80000000"
    $WS_VISIBLE = [uint32]0x10000000
    $WS_EX_APPWINDOW = [uint32]0x00040000
    $WS_EX_TOOLWINDOW = [uint32]0x00000080
    $WS_EX_NOACTIVATE = [uint32]0x08000000
    $WS_EX_TRANSPARENT = [uint32]0x00000020
    $HWND_TOP = [IntPtr]0
    $SW_RESTORE = 9
    $SW_SHOWNA = 8
    $SWP_FRAMECHANGED = [uint32]0x0020
    $SWP_NOACTIVATE = [uint32]0x0010
    $SWP_SHOWWINDOW = [uint32]0x0040

    [BagIdeaWallpaperWin]::SetWindowBits($engine, $GWL_STYLE, (Join-WindowBits @($WS_POPUP, $WS_VISIBLE)), $WS_CHILD)
    [BagIdeaWallpaperWin]::SetWindowBits(
      $engine, $GWL_EXSTYLE,
      (Join-WindowBits @($WS_EX_TOOLWINDOW, $WS_EX_NOACTIVATE, $WS_EX_TRANSPARENT)),
      $WS_EX_APPWINDOW)
    [void][BagIdeaWallpaperWin]::SetWindowRgn($engine, [IntPtr]::Zero, $true)

    if ([BagIdeaWallpaperWin]::GetParent($engine) -ne [IntPtr]::Zero) {
      [void][BagIdeaWallpaperWin]::SetParent($engine, [IntPtr]::Zero)
    }

    $placement = Get-OverlayPlacement
    [void][BagIdeaWallpaperWin]::ShowWindow($engine, $SW_RESTORE)
    [void][BagIdeaWallpaperWin]::ShowWindow($engine, $SW_SHOWNA)
    [void][BagIdeaWallpaperWin]::MoveWindow(
      $engine, [int]$placement.X, [int]$placement.Y, [int]$placement.W, [int]$placement.H, $true)
    [void][BagIdeaWallpaperWin]::SetWindowPos(
      $engine,
      $HWND_TOP,
      [int]$placement.X,
      [int]$placement.Y,
      [int]$placement.W,
      [int]$placement.H,
      (Join-WindowBits @($SWP_FRAMECHANGED, $SWP_NOACTIVATE, $SWP_SHOWWINDOW)))

    $pinKey = "overlay:{0}:{1}:{2}:{3}:{4}:{5}" -f $progman.ToInt64(), $placement.Monitor, $placement.X, $placement.Y, $placement.W, $placement.H
    if ($script:lastPinnedKey -ne $pinKey) {
      $script:lastPinnedKey = $pinKey
      Write-RepinLog ("overlay engine={0} z=top transparent-input=1 monitor={1} rect={2},{3},{4},{5}" -f $engine.ToInt64(), $placement.Monitor, $placement.X, $placement.Y, $placement.W, $placement.H)
    }
  }

  for ($i = 0; $i -lt 14400; $i++) {
    try {
      $engine = Find-EngineWindow
      $desktopParent = Find-DesktopParent
      if ($engine -ne [IntPtr]::Zero -and $desktopParent -ne [IntPtr]::Zero) {
        Pin-OfficeWindow $engine $desktopParent
      } elseif ($engine -ne [IntPtr]::Zero) {
        $progman = Find-ProgmanWindow
        if ($progman -ne [IntPtr]::Zero) {
          Pin-OfficeOverlayWindow $engine $progman
        } else {
          [void][BagIdeaWallpaperWin]::ShowWindow($engine, 0)
        }
        if (($i % 60) -eq 0) {
          Write-RepinLog ("waiting engine={0} parent=0" -f $engine.ToInt64())
        }
      } elseif (($i % 60) -eq 0) {
        Write-RepinLog ("waiting engine={0} parent={1}" -f $engine.ToInt64(), $desktopParent.ToInt64())
      }
    } catch {
      if (($i % 20) -eq 0) {
        Write-RepinLog ("loop error: {0}" -f $_.Exception.Message)
      }
    }
    Start-Sleep -Milliseconds 500
  }
} catch {
  Write-RepinLog ("fatal: {0}" -f $_.Exception.Message)
} finally {
  if ($mutex) {
    try { $mutex.ReleaseMutex() } catch {}
    $mutex.Dispose()
  }
}
