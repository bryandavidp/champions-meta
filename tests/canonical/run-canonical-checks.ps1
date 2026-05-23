Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Push-Location $root
try {
  node --experimental-vm-modules .\tests\canonical\run-canonical-checks.mjs
}
finally {
  Pop-Location
}
