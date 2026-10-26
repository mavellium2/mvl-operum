# Conectar o ChatGPT ao Operum

O conector usa o MCP remoto e o login OAuth do Operum. Não exige chave de API da OpenAI nem token pessoal do Operum. Requer uma conta no Operum e permissão no ChatGPT para cadastrar um MCP personalizado; políticas do workspace podem restringir essa opção.

## Para quem usa o Operum

1. Abra a área de apps/plugins do ChatGPT e escolha **Adicionar servidor MCP personalizado**. Algumas interfaces colocam essa opção nas configurações de apps e exigem modo de desenvolvedor.
2. Informe **Operum** como nome e `https://api.operum.adm.br/mcp` como URL (ou a URL informada em Integrações no seu ambiente).
3. Escolha **OAuth** e **CIMD / documento de identidade do cliente**, se houver essa opção. Não preencha segredo de cliente.
4. Conclua o cadastro e conecte. Na página do Operum, entre na sua conta, confira o retorno para `chatgpt.com`, selecione as instituições e as permissões e clique em **Permitir**.
5. Em uma nova conversa, selecione o Operum entre as ferramentas ou pelo `@` e peça: **Liste os meus projetos no Operum.**

Só leitura permite consultar. Para criar ou alterar, autorize escrita; as permissões do seu usuário e dos projetos continuam valendo. Para encerrar, vá a **Operum → Configurações → Integrações → Apps conectados → Desconectar**. Uma nova autorização é necessária para retomar.

## Configuração do servidor

Versão 1.41.0 ou posterior. O mesmo `.env` é lido por auth-service, api-gateway e mcp-server:

```dotenv
OAUTH_ISSUER=https://api.operum.adm.br
MCP_RESOURCE_URL=https://api.operum.adm.br/mcp
OAUTH_AUTHORIZE_URL=https://operum.adm.br/oauth/autorizar
OAUTH_CIMD_ALLOWED_HOSTS=claude.ai,chatgpt.com
OAUTH_DCR_ALLOWED_REDIRECTS=https://claude.ai/api/mcp/auth_callback,https://chatgpt.com/connector_platform_oauth_redirect
```

Mantenha a `MCP_GATEWAY_KEY` secreta já usada nos serviços. Se OAuth ainda não estiver habilitado, gere uma chave forte compartilhada apenas pelos serviços que a utilizam. Nunca a informe no ChatGPT. Recrie os serviços após atualizar as variáveis; um simples arquivo alterado não atualiza o ambiente dos containers.

Allowlists explícitas substituem os padrões do código: adicionar `chatgpt.com` é necessário mesmo após atualizar a aplicação se o `.env` ainda tiver apenas `claude.ai`. Preservar outros hosts e callbacks legítimos existentes. Não usar curingas.

O servidor anuncia identificação do emissor (`authorization_response_iss_parameter_supported`) e devolve `iss` nos callbacks de sucesso e erro. O ChatGPT pode então usar o cliente estável `https://chatgpt.com/oauth/client.json`. No CIMD, os callbacks vêm do documento validado na mesma origem. Em DCR, adicionar à allowlist a URL exata exibida no gerenciamento da conexão se ela diferir do retorno estável; isso não é necessário para os callbacks obtidos via CIMD.

O campo plural `token_endpoint_auth_methods_supported` do CIMD é uma lista de capacidades. O Operum aceita somente listas válidas com `none`, negociando o cliente público com PKCE S256, mesmo quando o campo singular legado prefere `private_key_jwt`. Não há suporte a clientes confidenciais nesta entrega.

## Homologação antes de anunciar disponibilidade

A compatibilidade está implementada e coberta por testes locais. A conexão real no ChatGPT depende do deploy e ainda precisa ser homologada:

- Conferir `/.well-known/oauth-protected-resource/mcp` e `/.well-known/oauth-authorization-server` públicos via HTTPS, sem cookie.
- Conferir autorização, recusa, retorno ao ChatGPT e chamada autenticada de listagem de projetos.
- Autorizar só leitura e conferir a recusa de escrita; testar uma operação reversível com escrita em projeto de teste.
- Conferir que somente as instituições escolhidas aparecem e que revogar em Integrações invalida a conexão.
- Conferir renovação do token e repetir uma conexão no Claude para regressão.

## Problemas comuns

| Situação | Como resolver |
| --- | --- |
| Opção de cadastrar MCP ausente | Conferir recursos da conta e políticas do workspace no ChatGPT. |
| Aplicativo não reconhecido | Conferir a allowlist CIMD, a versão e a leitura pública do documento do cliente. |
| Callback não permitido no DCR | Adicionar somente a URL exata informada pelo ChatGPT e recriar o auth-service. |
| Metadados respondem 404 | Conferir `OAUTH_ISSUER`, `MCP_RESOURCE_URL` e `MCP_GATEWAY_KEY` em todos os serviços envolvidos. |
| Projeto ausente ou escrita negada | Conferir instituições autorizadas, escopos e acesso do usuário ao projeto. |

Referências: [autenticação](https://developers.openai.com/plugins/build/auth) e [cadastro e teste](https://developers.openai.com/plugins/deploy/connect-chatgpt) da OpenAI. A interface do fornecedor pode mudar; a tela Integrações mantém o passo a passo por aplicativo.
