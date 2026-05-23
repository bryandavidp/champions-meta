param(
  [switch]$Update
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$argsList = @("--no-warnings", "--experimental-vm-modules", "tests/baseline/run-baseline.mjs")

if ($Update) {
  $argsList += "--update"
}

Push-Location $root
try {
  & node @argsList
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
