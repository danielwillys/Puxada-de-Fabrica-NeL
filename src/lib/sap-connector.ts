import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

/**
 * Geração dos arquivos do robô SAP (conector local).
 *
 * O robô roda numa máquina da rede interna da N&L:
 *  1. `PuxadaNL-SAP.vbs`  — SAP GUI Scripting: abre o SAP, faz login, roda as
 *     transações e exporta os arquivos para uma pasta local.
 *  2. `PuxadaNL-Enviar.ps1` — lê os arquivos exportados e envia para o sistema.
 *  3. `LEIA-ME.txt` — instruções de instalação e agendamento.
 *
 * A chave de integração é gravada no .ps1 no momento do download (só é exibida
 * uma vez, como qualquer chave de API).
 */

export const INGEST_URL = `${SUPABASE_URL}/functions/v1/process-import`;

export interface ConnectorOptions {
  /** Chave de integração em texto puro (mostrada uma única vez). */
  token: string;
  /** Pasta local onde o SAP grava os arquivos exportados. */
  exportDir: string;
  /** Usuário SAP do robô (somente leitura). */
  sapUser: string;
  /** Mandante (client) do SAP. */
  sapClient: string;
  /** Nome da conexão como aparece no SAP Logon. */
  sapConnection: string;
}

/** Robô SAP GUI Scripting: login + transações + exportação. */
export function buildVbsScript(o: ConnectorOptions): string {
  return `' =====================================================================
' Puxada de Fabrica N&L - Robo de extracao do SAP (SAP GUI Scripting)
' =====================================================================
' Este script abre o SAP, faz login e exporta COOISPI, Recebimento e MON
' para a pasta de trabalho. Rode-o pelo agendador junto do PuxadaNL-Enviar.ps1.
'
' IMPORTANTE (TI/BASIS):
'  - O SAP GUI Scripting precisa estar habilitado no servidor (sapgui/user_scripting)
'    e no cliente (SAP Logon > Opcoes > Acessibilidade e Scripting > Scripting).
'  - Use um usuario SAP de servico, com acesso SOMENTE LEITURA as transacoes.
'
' AJUSTE OBRIGATORIO: os nomes de campo/variante das transacoes mudam conforme
' a configuracao de cada empresa. Grave uma execucao com o proprio gravador do
' SAP (Mais > Script Recording and Playback) e cole os trechos indicados abaixo.
' =====================================================================

Dim SapGuiAuto, application, connection, session
Dim pasta, senha

pasta = "${o.exportDir.replace(/\\/g, "\\")}"
senha = WScript.Arguments(0)   ' a senha chega por parametro, nunca fica no arquivo

' --------------------------------------------------- abrir/conectar no SAP
Set SapGuiAuto = GetObject("SAPGUI")
Set application = SapGuiAuto.GetScriptingEngine

If application.Connections.Count = 0 Then
  Set connection = application.OpenConnection("${o.sapConnection}", True)
Else
  Set connection = application.Children(0)
End If
Set session = connection.Children(0)

' ------------------------------------------------------------ fazer login
If session.findById("wnd[0]/usr/txtRSYST-BNAME", False) Is Nothing Then
  ' ja esta logado
Else
  session.findById("wnd[0]/usr/txtRSYST-MANDT").Text = "${o.sapClient}"
  session.findById("wnd[0]/usr/txtRSYST-BNAME").Text = "${o.sapUser}"
  session.findById("wnd[0]/usr/pwdRSYST-BCODE").Text = senha
  session.findById("wnd[0]").sendVKey 0
  ' fecha aviso de multiplo logon, se aparecer
  If Not session.findById("wnd[1]", False) Is Nothing Then
    session.findById("wnd[1]").sendVKey 0
  End If
End If

' ===================================================================
' 1) COOISPI - Ordens de producao
' ===================================================================
session.findById("wnd[0]/tbar[0]/okcd").Text = "/nCOOIS"
session.findById("wnd[0]").sendVKey 0

' >>> COLE AQUI o trecho gravado: selecionar a variante/layout e executar <<<
' Exemplo do que costuma aparecer na gravacao:
' session.findById("wnd[0]/usr/ctxtS_AUFNR-LOW").Text = "..."
' session.findById("wnd[0]/tbar[1]/btn[8]").press
' session.findById("wnd[0]").sendVKey 8

Call ExportarPlanilha(session, pasta, "cooispi.txt")

' ===================================================================
' 2) RECEBIMENTO - Entradas fisicas
' ===================================================================
session.findById("wnd[0]/tbar[0]/okcd").Text = "/nZRECEBIMENTO"   ' ajuste a transacao
session.findById("wnd[0]").sendVKey 0
' >>> COLE AQUI o trecho gravado da selecao e execucao <<<
Call ExportarPlanilha(session, pasta, "recebimento.txt")

' ===================================================================
' 3) MON - Tarefas de deposito (EWM)
' ===================================================================
session.findById("wnd[0]/tbar[0]/okcd").Text = "/n/SCWM/MON"
session.findById("wnd[0]").sendVKey 0
' >>> COLE AQUI o trecho gravado: no monitor, abrir Tarefa de deposito <<<
Call ExportarPlanilha(session, pasta, "mon.txt")

session.findById("wnd[0]/tbar[0]/okcd").Text = "/nex"
session.findById("wnd[0]").sendVKey 0
WScript.Echo "Extracao concluida."

' ===================================================================
' Exporta a lista atual como arquivo de texto (Lista > Exportar > Arquivo local
' > Nao convertido). E o formato mais estavel para ler depois.
' ===================================================================
Sub ExportarPlanilha(sess, destino, arquivo)
  On Error Resume Next
  sess.findById("wnd[0]").sendVKey 0
  ' Menu: Lista > Exportar > Arquivo local  (atalho Ctrl+Shift+F9 na maioria)
  sess.findById("wnd[0]/mbar/menu[0]/menu[1]/menu[2]").select
  If Not sess.findById("wnd[1]", False) Is Nothing Then
    ' escolhe "Nao convertido"
    sess.findById("wnd[1]/usr/subSUBSCREEN_STEPLOOP:SAPLSPO5:0150/sub:SAPLSPO5:0150/radSPOPLI-SELFLAG[0,0]").select
    sess.findById("wnd[1]/tbar[0]/btn[0]").press
    sess.findById("wnd[1]/usr/ctxtDY_PATH").Text = destino
    sess.findById("wnd[1]/usr/ctxtDY_FILENAME").Text = arquivo
    sess.findById("wnd[1]/tbar[0]/btn[11]").press
  End If
  On Error Goto 0
End Sub
`;
}

/** Envia os arquivos exportados para o sistema (roda logo após o VBS). */
export function buildPowerShellScript(o: ConnectorOptions): string {
  return `# =====================================================================
# Puxada de Fabrica N&L - Envio automatico dos dados do SAP
# =====================================================================
# Le os arquivos exportados pelo robo e envia para o sistema.
# Nao precisa de Excel instalado: le o formato "nao convertido" do SAP.
# =====================================================================

$ErrorActionPreference = "Stop"

$Pasta    = "${o.exportDir}"
$Endpoint = "${INGEST_URL}"
$ApiKey   = "${o.token}"
$AnonKey  = "${SUPABASE_PUBLISHABLE_KEY}"

$Arquivos = @{
  "cooispi"     = "cooispi.txt"
  "recebimento" = "recebimento.txt"
  "mon"         = "mon.txt"
}

function Convert-SapList {
  param([string]$Caminho)

  # O export "nao convertido" do SAP vem com colunas separadas por | e
  # linhas de moldura feitas de tracos.
  $linhas = Get-Content -LiteralPath $Caminho -Encoding UTF8 |
            Where-Object { $_ -match "\\|" -and $_ -notmatch "^[-\\s|]+$" }
  if ($linhas.Count -lt 2) { return @() }

  $cabecalho = $linhas[0].Trim('|').Split('|') | ForEach-Object { $_.Trim() }
  $saida = @()
  foreach ($linha in $linhas[1..($linhas.Count - 1)]) {
    $valores = $linha.Trim('|').Split('|') | ForEach-Object { $_.Trim() }
    $obj = @{}
    for ($i = 0; $i -lt $cabecalho.Count; $i++) {
      $nome = $cabecalho[$i]
      if ([string]::IsNullOrWhiteSpace($nome)) { continue }
      $obj[$nome] = if ($i -lt $valores.Count) { $valores[$i] } else { "" }
    }
    # ignora linhas totalmente vazias
    if (($obj.Values | Where-Object { $_ -ne "" }).Count -gt 0) { $saida += $obj }
  }
  return $saida
}

foreach ($tipo in $Arquivos.Keys) {
  $caminho = Join-Path $Pasta $Arquivos[$tipo]
  if (-not (Test-Path $caminho)) {
    Write-Host "[$tipo] arquivo nao encontrado, pulando: $caminho"
    continue
  }

  $linhas = Convert-SapList -Caminho $caminho
  if ($linhas.Count -eq 0) {
    Write-Host "[$tipo] nenhuma linha de dados, pulando."
    continue
  }

  $corpo = @{
    file_type   = $tipo
    file_name   = "SAP-robo-$tipo-$(Get-Date -Format 'yyyy-MM-dd-HH-mm').txt"
    raw_headers = $true
    rows        = $linhas
  } | ConvertTo-Json -Depth 6 -Compress

  try {
    $resposta = Invoke-RestMethod -Uri $Endpoint -Method Post \`
      -Headers @{ "x-api-key" = $ApiKey; "apikey" = $AnonKey; "Content-Type" = "application/json" } \`
      -Body ([System.Text.Encoding]::UTF8.GetBytes($corpo))

    if ($resposta.ok) {
      Write-Host "[$tipo] OK - $($resposta.inserted) inseridas, $($resposta.updated) atualizadas, $($resposta.rejected) rejeitadas"
      # guarda o arquivo processado para conferencia
      $historico = Join-Path $Pasta "processados"
      if (-not (Test-Path $historico)) { New-Item -ItemType Directory -Path $historico | Out-Null }
      Move-Item $caminho (Join-Path $historico "$tipo-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt") -Force
    } else {
      Write-Host "[$tipo] ERRO: $($resposta.error)"
    }
  } catch {
    Write-Host "[$tipo] FALHA no envio: $($_.Exception.Message)"
  }
}
`;
}

/** Instruções de instalação e agendamento. */
export function buildReadme(o: ConnectorOptions): string {
  return `PUXADA DE FABRICA N&L - ROBO DE EXTRACAO DO SAP
================================================

O QUE E
-------
Um robo que roda numa maquina da rede interna, abre o SAP, extrai COOISPI,
Recebimento e MON, e envia os dados automaticamente para o sistema.
A importacao manual por planilha continua funcionando como reserva.

ARQUIVOS
--------
1. PuxadaNL-SAP.vbs       Abre o SAP, faz login e exporta os arquivos
2. PuxadaNL-Enviar.ps1    Le os arquivos e envia para o sistema
3. LEIA-ME.txt            Este arquivo

PRE-REQUISITOS (falar com a TI/BASIS)
-------------------------------------
[ ] SAP GUI para Windows instalado na maquina
[ ] SAP GUI Scripting HABILITADO:
      - Servidor: parametro sapgui/user_scripting = TRUE
      - Cliente: SAP Logon > Opcoes > Acessibilidade e Scripting > Scripting
                 marcar "Ativar scripting" e DESmarcar os avisos de confirmacao
[ ] Usuario SAP de servico, SOMENTE LEITURA, sem expiracao curta de senha
[ ] Maquina com acesso a internet para enviar os dados

INSTALACAO
----------
1. Crie a pasta: ${o.exportDir}
2. Copie os 3 arquivos para essa pasta.
3. Guarde a senha do usuario SAP no Gerenciador de Credenciais do Windows
   (nao deixe a senha escrita em arquivo).

COMO RODAR MANUALMENTE (teste)
------------------------------
Abra o Prompt de Comando na pasta e rode:

    cscript PuxadaNL-SAP.vbs SUA_SENHA_SAP
    powershell -ExecutionPolicy Bypass -File PuxadaNL-Enviar.ps1

Confira no sistema, em Importacao de Dados > Historico, se a carga apareceu
como automatica.

AGENDAR DE HORA EM HORA
-----------------------
1. Abra o "Agendador de Tarefas" do Windows
2. Criar Tarefa (nao "tarefa basica")
3. Aba Geral: marque "Executar estando o usuario conectado ou nao"
4. Aba Disparadores: novo disparador, diariamente, repetir a cada 1 hora
5. Aba Acoes: novo > Iniciar um programa
      Programa: powershell.exe
      Argumentos: -ExecutionPolicy Bypass -File "${o.exportDir}\\PuxadaNL-Enviar.ps1"
      Iniciar em: ${o.exportDir}
   (crie uma acao antes dessa para o cscript do VBS)

AJUSTE DAS TRANSACOES (passo importante)
----------------------------------------
Os nomes de campo e variantes mudam conforme a configuracao de cada empresa.
Para acertar o script:

1. No SAP, va em Mais > Script Recording and Playback (ou Alt+F12)
2. Clique em Gravar e faca a extracao manualmente como voce ja faz hoje
3. Pare a gravacao - o SAP gera um arquivo .vbs
4. Copie os trechos gerados e cole no PuxadaNL-SAP.vbs nos pontos marcados
   com ">>> COLE AQUI <<<"

SEGURANCA
---------
- A chave de integracao esta dentro do PuxadaNL-Enviar.ps1. Ela permite APENAS
  enviar dados de importacao, nada mais.
- Se a chave vazar ou a maquina for trocada, revogue a chave no sistema
  (Importacao de Dados > Automacao SAP) e gere uma nova.
- A senha do SAP nunca e gravada nos arquivos: ela entra por parametro.

SUPORTE
-------
Se a carga parar de chegar, verifique nesta ordem:
1. A maquina esta ligada e com internet?
2. O SAP abre normalmente com o usuario do robo? (senha expirada?)
3. Os arquivos .txt estao sendo criados na pasta?
4. No sistema, a chave aparece como ativa e com "ultimo uso" recente?
`;
}
