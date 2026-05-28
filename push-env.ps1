# push-env.ps1 — Pushes .env keys to Vercel via REST API
# Usage: .\push-env.ps1 -Token "your_vercel_token"
# Get token at: https://vercel.com/account/tokens
#
# Or set it as an env var first:
#   $env:VERCEL_TOKEN = "your_token"
#   .\push-env.ps1

param(
  [string]$Token = $env:VERCEL_TOKEN
)

if (-not $Token) {
  Write-Error "No token. Run: .\push-env.ps1 -Token 'your_vercel_token'"
  Write-Host "Get a token at: https://vercel.com/account/tokens"
  exit 1
}

# ── Read project IDs from .vercel/project.json ────────────────────────────────
$proj = Get-Content ".vercel\project.json" | ConvertFrom-Json
$projectId = $proj.projectId
$teamId    = $proj.orgId

Write-Host "Project: $($proj.projectName) ($projectId)"
Write-Host "Team:    $teamId"
Write-Host ""

# ── Read keys from .env ───────────────────────────────────────────────────────
$envVars = @{}
Get-Content ".env" | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith('#')) {
    $idx = $line.IndexOf('=')
    if ($idx -gt 0) {
      $key = $line.Substring(0, $idx).Trim()
      $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
      if ($val -and -not $val.Contains('xxxxx') -and $val.Length -gt 5) {
        $envVars[$key] = $val
      }
    }
  }
}

if ($envVars.Count -eq 0) {
  Write-Error "No valid keys found in .env — fill in real values first."
  exit 1
}

Write-Host "Keys to push: $($envVars.Keys -join ', ')"
Write-Host ""

# ── Push each key to all environments ────────────────────────────────────────
$headers = @{
  Authorization  = "Bearer $Token"
  "Content-Type" = "application/json"
}

foreach ($key in $envVars.Keys) {
  $val  = $envVars[$key]
  $body = @{
    key    = $key
    value  = $val
    type   = "encrypted"
    target = @("production", "preview", "development")
  } | ConvertTo-Json

  $url = "https://api.vercel.com/v10/projects/$projectId/env?teamId=$teamId"

  try {
    $r = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body -ErrorAction Stop
    Write-Host "  ✅  $key"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 409) {
      # Already exists — update it
      try {
        # Get existing env ID
        $list = Invoke-RestMethod -Uri "https://api.vercel.com/v10/projects/$projectId/env?teamId=$teamId" -Headers $headers
        $existing = $list.envs | Where-Object { $_.key -eq $key } | Select-Object -First 1
        if ($existing) {
          $patchUrl = "https://api.vercel.com/v10/projects/$projectId/env/$($existing.id)?teamId=$teamId"
          Invoke-RestMethod -Uri $patchUrl -Method PATCH -Headers $headers -Body $body | Out-Null
          Write-Host "  🔄  $key (updated)"
        }
      } catch {
        Write-Host "  ⚠️  $key (conflict, could not update: $_)"
      }
    } else {
      Write-Host "  ❌  $key — $($_.Exception.Message)"
    }
  }
}

Write-Host ""
Write-Host "Done. Now redeploy: node `"$PWD\node_modules\vercel\dist\index.js`" --prod"
