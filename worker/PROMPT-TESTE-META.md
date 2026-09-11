# Validar o funil no Gerenciador de Eventos — 4 prompts, em ordem

O agente do Chrome trabalha em uma tela por vez. Use os quatro blocos na
sequência: Meta → Cloudflare → Meta → Cloudflare. Cada bloco é
autocontido.

---

## Prompt 1 — Meta: pegar o código de teste

Tela: Gerenciador de Eventos, logado na conta que administra o pixel.

```
No Gerenciador de Eventos do Meta (business.facebook.com/events_manager2):
1. No menu da esquerda, selecione o pixel 564676471958688.
2. Abra a aba "Testar eventos" (Test events).
3. Na seção do SERVIDOR ("Testar eventos do servidor" / "Confirm your server's events
   are set up correctly") há um código no formato TEST12345. Copie e me mostre esse
   código exatamente como está.
4. Não altere nada. Não feche a aba: vou voltar aqui depois.
```

Guarde o código que ele devolver — vai entrar no Prompt 2.

---

## Prompt 2 — Cloudflare: ligar o código de teste no Worker

Tela: dash.cloudflare.com, logado. **Código atual: `TEST38195`** (gerado em 10/09/2026 — se o Meta mostrar outro no Prompt 1, use o novo).

```
No dashboard do Cloudflare:
1. Abra Workers (ou "Compute (Workers)" / "Workers & Pages") → Worker "capi-aline".
2. Vá em Settings → "Variables and Secrets" (pode aparecer como "Variables" ou
   "Environment variables").
3. Clique em "Add variable" e crie uma variável do tipo TEXTO (Text/Plaintext, NÃO
   Secret) com:
   Nome: TEST_EVENT_CODE
   Valor: TEST38195
4. Clique em "Deploy" / "Save" / "Add 1 variable and deploy".
5. Me confirme que a variável TEST_EVENT_CODE aparece na lista e que o deploy foi
   feito.
REGRAS: não toque em CAPI_TOKEN, PIXEL_ID, GRAPH_VERSION nem ALLOWED_ORIGINS. Não
mexa em nada fora deste Worker. Se a tela estiver diferente, descreva o que vê.
```

---

## Prompt 3 — Meta: gerar os eventos e ler o resultado

Tela: Gerenciador de Eventos, aba "Testar eventos" do pixel 564676471958688.

```
Estou na aba "Testar eventos" do pixel 564676471958688. Vou validar o funil do meu
site. Siga na ordem e me reporte cada etapa.

GERAR OS EVENTOS
1. Na seção do NAVEGADOR ("Testar eventos do navegador"), cole esta URL no campo de
   site e clique no botão "Abrir site":
   https://lp.alineexplicasap.com.br/?utm_source=meta&utm_medium=cpc&utm_campaign=teste-validacao&utm_content=agente
   É obrigatório abrir POR ESSE BOTÃO, e não digitando na barra de endereço, senão o
   Meta não associa o navegador ao teste.
2. Na aba do site que abriu: espere 3 segundos, depois role devagar até o fim da
   página, parando 2 segundos a cada tela.
3. Clique em um botão verde com "QUERO" ou "GARANTIR" que leve para a seção de preço
   da própria página (rolagem interna).
4. Na seção de preço, clique em "GARANTIR MINHA VAGA AGORA". Vai abrir uma aba da
   Hotmart. Copie a URL completa dessa aba, me mostre, e FECHE a aba. NÃO preencha
   nada, NÃO compre. A URL deve conter "src=meta" e "sck=teste-validacao".

LER O RESULTADO
5. Volte para a aba "Testar eventos" e aguarde até 60 segundos.
6. Liste TODOS os eventos que apareceram, em ordem, com estas informações de cada um:
   - nome do evento
   - origem: Navegador, Servidor, ou os dois
   - se aparece a marcação "Deduplicado" / "Deduplicated"
   - se tem os parâmetros value e currency (clique no evento para expandir)
7. Em um dos eventos com origem Servidor, expanda e liste quais "parâmetros de
   correspondência" / "matching parameters" o Meta recebeu (procure external_id,
   fbp, fbc, endereço IP, agente do usuário, cidade, estado, país).
8. Se algum evento apareceu só como Navegador, só como Servidor, ou com os dois SEM
   a marcação de deduplicado, destaque qual.

O ESPERADO é: PageView, ViewContent, AddToWishlist, AddToCart e InitiateCheckout,
cada um com par Navegador + Servidor deduplicado. Se aparecer evento com outro nome,
me avise.

REGRAS: não compre nada, não preencha pagamento, não altere nada no pixel nem na
conta de anúncios. Se alguma tela estiver diferente, descreva o que vê.
```

---

## Prompt 4 — Cloudflare: remover o código de teste (OBRIGATÓRIO)

Tela: dash.cloudflare.com. **Rode assim que terminar o Prompt 3.**
Enquanto `TEST_EVENT_CODE` existir, todo evento real das campanhas vai para
a tela de teste e não conta como conversão.

```
No dashboard do Cloudflare:
1. Abra Workers → Worker "capi-aline" → Settings → "Variables and Secrets".
2. Localize a variável TEST_EVENT_CODE e APAGUE somente ela (ícone de lixeira /
   "Delete" / "Remove").
3. Clique em "Deploy" / "Save" para aplicar.
4. Confira a lista: devem sobrar apenas PIXEL_ID, GRAPH_VERSION, ALLOWED_ORIGINS e
   CAPI_TOKEN. Me confirme com a frase exata: "TEST_EVENT_CODE removida e deploy feito".
REGRAS: não toque em nenhuma outra variável nem em outro Worker.
```
