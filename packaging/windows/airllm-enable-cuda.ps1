<#
.SYNOPSIS
  Switch AirLLM's bundled CPU-only PyTorch to a CUDA build (or back).

.EXAMPLE
  airllm-enable-cuda              # CUDA variant @DEFAULT_CUDA_VARIANT@ (default)
  airllm-enable-cuda cu126        # any variant served at download.pytorch.org/whl/<variant>
  airllm-enable-cuda disable      # back to the bundled CPU build
  airllm-enable-cuda status

.NOTES
  CUDA wheels go to <install dir>\cuda-site, which airllm-python.cmd puts first on the path.
  Installed under Program Files? Run from an elevated (Administrator) prompt.
  Re-run after upgrading AirLLM if the bundled torch version changed.
#>
param([string] $Variant = '@DEFAULT_CUDA_VARIANT@')

$ErrorActionPreference = 'Stop'
$home_ = $PSScriptRoot
$py = Join-Path $home_ 'python\python.exe'
$cudaSite = Join-Path $home_ 'cuda-site'

function Show-Status {
    if (Test-Path $cudaSite) {
        $v = Get-Content -ErrorAction SilentlyContinue (Join-Path $cudaSite '.airllm-variant')
        Write-Host "CUDA overlay: $v at $cudaSite"
    } else {
        Write-Host 'CUDA overlay: not installed (using bundled CPU build)'
    }
    & (Join-Path $home_ 'airllm-python.cmd') -c "import torch; print('torch', torch.__version__, '| CUDA available:', torch.cuda.is_available())"
}

switch -Regex ($Variant) {
    '^(-h|--help|-help|/\?)$' { Get-Help $PSCommandPath -Detailed; exit 0 }
    '^(--)?status$'  { Show-Status; exit 0 }
    '^(--)?disable$' { Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $cudaSite; Write-Host 'CUDA overlay removed.'; Show-Status; exit 0 }
    '^(cu\d+|rocm[\d.]+)$' { break }
    default { Write-Error "unknown variant '$Variant' (expected e.g. cu126, cu128, cu130)"; exit 2 }
}

$torchVersion = (& $py -c "import importlib.metadata as m; print(m.version('torch').split('+')[0])").Trim()
# torchvision (used by vision models' image processors) must be the build that matches torch.
$visionVersion = $null
try { $visionVersion = (& $py -c "import importlib.metadata as m; print(m.version('torchvision').split('+')[0])" 2>$null) }
catch { $visionVersion = $null }   # Windows PowerShell 5.1 turns native stderr into an error under 'Stop'
$packages = @("torch==$torchVersion")
if ($LASTEXITCODE -eq 0 -and $visionVersion) { $packages += "torchvision==$("$visionVersion".Trim())" }
Write-Host "Installing $($packages -join ' ') ($Variant) into $cudaSite ..."

$tmp = "$cudaSite.new"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $tmp
$env:PIP_DISABLE_PIP_VERSION_CHECK = '1'; $env:PIP_NO_CACHE_DIR = '1'
& $py -m pip install --no-warn-script-location --target $tmp --index-url "https://download.pytorch.org/whl/$Variant" @packages
if ($LASTEXITCODE -ne 0) {
    Write-Error "pip failed. Check that '$Variant' offers torch $torchVersion (see https://pytorch.org/get-started/locally/) and that this prompt can write to $home_ (run as Administrator)."
    exit 1
}
Set-Content -Path (Join-Path $tmp '.airllm-variant') -Value $Variant
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $cudaSite
Move-Item $tmp $cudaSite
Show-Status
