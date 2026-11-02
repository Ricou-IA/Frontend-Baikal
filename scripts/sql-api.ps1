# ---------------------------------------------------------------------------
# Joue un fichier SQL sur un projet Supabase par l'API de gestion.
#
#   .\scripts\sql-api.ps1 -Ref <ref du projet> -Fichier <chemin.sql> [-Schema <nom>]
#
# -Schema remplace @SCHEMA@ dans le fichier : c'est ainsi qu'un module de
# docs/contrats/ s'installe dans un schéma jetable pour sa recette.
#
# Le jeton est SUPABASE_ACCESS_TOKEN, variable utilisateur Windows (celle que
# le CLI accepte aussi). Il n'est jamais affiché.
#
# Pièges PowerShell 5.1, tous rencontrés : Get-Content -Raw rend une chaîne à
# propriétés étendues que ConvertTo-Json sérialise en {"value": …}, d'où le
# cast [string] ; le corps part en octets UTF-8 explicites, sinon les accents
# arrivent en Latin-1 ; Invoke-RestMethod décode la réponse en Latin-1, un
# « é » peut donc s'afficher « Ã© » sans que la base soit fausse.
# ---------------------------------------------------------------------------
param(
  [Parameter(Mandatory = $true)] [string] $Ref,
  [Parameter(Mandatory = $true)] [string] $Fichier,
  [string] $Schema = ""
)

$ErrorActionPreference = "Stop"

$jeton = [Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "User")
if (-not $jeton) { Write-Error "SUPABASE_ACCESS_TOKEN absent des variables utilisateur"; exit 1 }
if (-not (Test-Path $Fichier)) { Write-Error "fichier introuvable : $Fichier"; exit 1 }

[string] $sql = [IO.File]::ReadAllText((Resolve-Path $Fichier), [Text.Encoding]::UTF8)
if ($Schema -ne "") { $sql = $sql.Replace("@SCHEMA@", $Schema) }

$corps = [Text.Encoding]::UTF8.GetBytes((@{ query = $sql } | ConvertTo-Json -Compress -Depth 3))
$entetes = @{ Authorization = "Bearer $jeton"; "Content-Type" = "application/json" }
$url = "https://api.supabase.com/v1/projects/$Ref/database/query"

try {
  $reponse = Invoke-RestMethod -Method Post -Uri $url -Headers $entetes -Body $corps
} catch {
  # Le corps de l'erreur (le message Postgres) est dans ErrorDetails ; à
  # défaut, on relit le flux de la réponse.
  $detail = ""
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    $detail = $_.ErrorDetails.Message
  } elseif ($_.Exception.Response) {
    $flux = $_.Exception.Response.GetResponseStream()
    $flux.Position = 0
    $lecteur = New-Object IO.StreamReader($flux, [Text.Encoding]::UTF8)
    $detail = $lecteur.ReadToEnd()
  }
  Write-Error "l'API a refuse le SQL : $($_.Exception.Message) $detail"
  exit 1
}

$reponse | ConvertTo-Json -Depth 8
