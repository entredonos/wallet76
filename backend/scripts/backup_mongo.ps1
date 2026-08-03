# Backup semanal do MongoDB Atlas (Wallet76) - criado a 3 ago 2026.
#
# PORQUE EXISTE: o Atlas M0 (plano gratis) NAO tem backups automaticos.
# Um erro ou incidente apaga os portefolios de todos os clientes sem
# recuperacao possivel (Wallet76_NEGOCIO.md, alerta 2). Este script e a
# mitigacao gratis: mongodump semanal para o PC, agendado no Agendador
# de Tarefas do Windows (ver README, seccao 13).
#
# O QUE FAZ: le o MONGO_URL do backend\.env (nunca o imprime), corre
# mongodump --gzip --archive para C:\Users\bruno\Backups\Wallet76Mongo,
# confirma que o ficheiro nao e suspeito de vazio, e guarda os ultimos
# 8 arquivos (2 meses de semanais). Tudo registado em backup.log na
# mesma pasta.
#
# NOTA DE ENCODING: este ficheiro nao tem acentos de proposito - o
# PowerShell 5.1 le .ps1 sem BOM como ANSI e estraga-os (mesma armadilha
# das mensagens de commit, ver a skill wallet76).

$RepoDir   = "C:\Users\bruno\Desktop\APPS\Wallet76"
$BackupDir = "C:\Users\bruno\Backups\Wallet76Mongo"
$Keep      = 8

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
}
$LogFile = Join-Path $BackupDir "backup.log"

function Write-Log([string]$msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

try {
    # 1. MONGO_URL do .env (sem nunca o expor em log ou consola)
    $envFile = Join-Path $RepoDir "backend\.env"
    if (-not (Test-Path $envFile)) { throw "backend\.env nao encontrado em $envFile" }
    $line = (Get-Content $envFile) | Where-Object { $_ -match '^\s*MONGO_URL\s*=' } | Select-Object -First 1
    if (-not $line) { throw "MONGO_URL nao encontrado no .env" }
    $uri = ($line -replace '^\s*MONGO_URL\s*=', '').Trim().Trim('"').Trim("'")
    if (-not $uri) { throw "MONGO_URL vazio" }

    # 2. mongodump instalado? Primeiro o PATH; se nao estiver la, o caminho
    #    padrao do MSI das Database Tools (o winget instala sem mexer no
    #    PATH - visto a 3 ago 2026). O glob no numero da versao (100, ...)
    #    sobrevive a upgrades.
    $dumpPath = $null
    $cmd = Get-Command mongodump -ErrorAction SilentlyContinue
    if ($cmd) {
        $dumpPath = $cmd.Source
    } else {
        $exe = Get-Item "C:\Program Files\MongoDB\Tools\*\bin\mongodump.exe" -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1
        if ($exe) { $dumpPath = $exe.FullName }
    }
    if (-not $dumpPath) { throw "mongodump nao encontrado (PATH e C:\Program Files\MongoDB\Tools) - instalar MongoDB Database Tools" }

    # 3. Dump. Start-Process em vez do operador & por causa do PS 5.1:
    #    o mongodump escreve o progresso em stderr, e com stderr
    #    redirecionado pelo & o PS 5.1 embrulha cada linha num
    #    ErrorRecord (NativeCommandError) - com ErrorActionPreference
    #    Stop isso mata o script a meio de um dump saudavel.
    $stamp   = Get-Date -Format "yyyy-MM-dd_HHmm"
    $archive = Join-Path $BackupDir ("wallet76-{0}.archive.gz" -f $stamp)
    $errTmp  = Join-Path $env:TEMP ("mongodump-err-{0}.txt" -f $stamp)
    Write-Log "INICIO -> $archive"

    $p = Start-Process -FilePath $dumpPath `
        -ArgumentList @("--uri=$uri", "--gzip", "--archive=$archive") `
        -NoNewWindow -Wait -PassThru -RedirectStandardError $errTmp
    if ($p.ExitCode -ne 0) {
        $err = ""
        if (Test-Path $errTmp) { $err = (Get-Content $errTmp -Tail 5) -join " | " }
        throw "mongodump exit $($p.ExitCode): $err"
    }
    Remove-Item $errTmp -Force -ErrorAction SilentlyContinue

    # 4. Guarda contra backup vazio: um archive.gz saudavel desta base
    #    tem centenas de KB; menos de 10 KB e um dump que falhou a meio
    #    ou uma base vazia - nao serve de rede de seguranca.
    $size = (Get-Item $archive).Length
    if ($size -lt 10240) { throw ("arquivo suspeito de vazio: {0} bytes" -f $size) }
    Write-Log ("OK  {0:N0} bytes" -f $size)

    # 5. Retencao: ficam os $Keep mais recentes (nome = data, ordena bem)
    Get-ChildItem $BackupDir -Filter "wallet76-*.archive.gz" |
        Sort-Object Name -Descending |
        Select-Object -Skip $Keep |
        ForEach-Object {
            Write-Log ("RETENCAO apaga {0}" -f $_.Name)
            Remove-Item $_.FullName -Force
        }

    exit 0
}
catch {
    Write-Log ("ERRO  {0}" -f $_.Exception.Message)
    exit 1
}
