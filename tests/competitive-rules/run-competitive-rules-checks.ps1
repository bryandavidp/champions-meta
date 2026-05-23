Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Push-Location $root
try {
  node --experimental-vm-modules .\tests\competitive-rules\run-competitive-rules-checks.mjs
}
finally {
  Pop-Location
}
