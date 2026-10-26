import Image from 'next/image'
import { ArrowUpRight, BookOpen, ChevronDown, Link2, ShieldCheck } from 'lucide-react'
import CopyConnectionValue from './CopyConnectionValue'

const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL || 'https://api.operum.adm.br/mcp'

const guides = [
  {
    id: 'chatgpt', name: 'ChatGPT', logo: 'openai', color: 'bg-emerald-50',
    surface: 'Converse com seus projetos', method: 'Login com OAuth',
    description: 'Consulte projetos, organize tarefas e acompanhe o trabalho sem sair da conversa.',
    requirement: 'Conta no ChatGPT com permissão para adicionar servidores MCP personalizados. A disponibilidade depende da conta e das políticas do workspace.',
    steps: [
      'No ChatGPT, abra a área de apps ou plugins e procure Adicionar servidor MCP personalizado. Se sua interface exigir, ative o modo de desenvolvedor nas configurações avançadas de apps.',
      'Dê o nome Operum, informe a URL abaixo e escolha autenticação OAuth. Use o registro por documento de cliente (CIMD), se houver essa opção. Não é necessário gerar token pessoal nem informar segredo de cliente.',
      'Conclua a criação e clique para conectar. Na página do Operum, entre na sua conta, confira o retorno para chatgpt.com e escolha as instituições e permissões que deseja autorizar.',
      'Clique em Permitir e volte ao ChatGPT. Em uma nova conversa, selecione o Operum no menu de ferramentas ou pelo @ e faça o primeiro pedido.',
    ],
    help: 'Se a opção de adicionar não aparecer, confira as permissões do workspace com seu administrador. Se o Operum mostrar “Aplicativo não reconhecido”, a configuração do servidor precisa permitir o ChatGPT. Solicite a atualização ao administrador do Operum.',
    url: 'https://developers.openai.com/plugins/deploy/connect-chatgpt',
  },
  {
    id: 'claude', name: 'Claude', logo: 'claude', color: 'bg-orange-50',
    surface: 'Web, desktop e celular', method: 'Login com OAuth',
    description: 'Leve o contexto do Operum para o Claude e trabalhe com seus projetos em linguagem natural.',
    requirement: 'Conta no Claude com acesso a conectores personalizados. Em uma organização, o administrador pode precisar adicionar o conector antes.',
    steps: [
      'No Claude pela web, abra Configurações → Conectores e adicione um conector personalizado. Em organizações, o administrador pode encontrar essa opção em Conectores → Adicionar → Personalizado → Web.',
      'Informe o nome Operum e a URL abaixo. Use a autenticação detectada com login OAuth e a identidade publicada do Claude, se houver essa opção. Não preencha um segredo de cliente.',
      'Clique em Conectar e entre no Operum. Confira o retorno para claude.ai, selecione as instituições e autorize leitura ou leitura e escrita.',
      'Volte ao Claude e habilite o Operum nas ferramentas da conversa. A conexão remota também pode ser usada no desktop e no celular, conforme a disponibilidade da sua conta.',
    ],
    help: 'Se o conector não aparecer em uma conversa, confira se ele está habilitado nas ferramentas. Em contas de equipe, peça ao administrador para liberar o conector. Se o login não abrir, o administrador do Operum deve conferir a configuração OAuth.',
    url: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
  },
  {
    id: 'claude-code', name: 'Claude Code', logo: 'claude', color: 'bg-orange-50',
    surface: 'Terminal e editor', method: 'Login com OAuth ou token pessoal',
    description: 'Consulte cards, registre avanços e conecte suas tarefas ao trabalho de desenvolvimento.',
    requirement: 'Claude Code instalado no seu computador e acesso aos projetos no Operum.',
    steps: [
      'No terminal do computador em que você usa o Claude Code, execute o comando abaixo para cadastrar o servidor remoto do Operum.',
      'Abra o Claude Code, execute /mcp e selecione o Operum para autenticar. O navegador abrirá o login e a autorização do Operum.',
      'Confira que o retorno é para localhost ou 127.0.0.1 no seu computador, escolha as instituições e autorize as permissões necessárias.',
      'Volte ao Claude Code e faça o primeiro pedido. Se preferir token pessoal, gere um na seção abaixo: ao gerar, o Operum mostra o comando de conexão com o token. Não compartilhe esse comando.',
    ],
    command: `claude mcp add --transport http operum ${MCP_SERVER_URL}`,
    help: 'Use claude mcp list para conferir o cadastro. Se já houver uma conexão antiga, remova-a com claude mcp remove operum antes de cadastrar de novo. Tokens pessoais valem para a instituição em que foram gerados e precisam ser renovados ao vencer.',
    url: 'https://code.claude.com/docs/en/mcp',
  },
  {
    id: 'codex', name: 'Codex', logo: 'openai', color: 'bg-slate-100',
    surface: 'CLI e configurações locais compartilhadas', method: 'Login com OAuth',
    description: 'Use o Operum como contexto para desenvolver, consultar tarefas e registrar entregas.',
    requirement: 'Codex CLI instalado. O cadastro local pode ser compartilhado com o aplicativo e a extensão que usam a mesma configuração MCP.',
    steps: [
      'No terminal do seu computador, execute os comandos abaixo para cadastrar o Operum e iniciar o login OAuth.',
      'No navegador, entre no Operum. Confira o retorno local para o seu computador, escolha as instituições e autorize as permissões necessárias.',
      'Volte ao Codex e confira se o Operum aparece entre os servidores MCP. Reabra a sessão caso a lista de ferramentas ainda não tenha sido atualizada.',
      'Faça o primeiro pedido. Para remover as credenciais locais, use codex mcp logout operum. Para revogar o acesso no Operum, use Apps conectados nesta página.',
    ],
    command: `codex mcp add operum --url ${MCP_SERVER_URL}\ncodex mcp login operum`,
    help: 'Se o navegador não concluir o login, confira se o Codex está atualizado e se pode receber o retorno local. A configuração local não conecta automaticamente ambientes de nuvem.',
    url: 'https://learn.chatgpt.com/docs/extend/mcp',
  },
]

export default function IntegrationGuides() {
  return (
    <section aria-labelledby="integration-guides-title" className="space-y-5">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6 sm:p-8">
        <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-medium text-blue-700"><Link2 size={14} aria-hidden="true" /> Operum + seus assistentes</span>
        <h2 id="integration-guides-title" className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">Seus projetos, na conversa.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">Conecte o assistente que você já usa para consultar projetos, criar tarefas, comentar e registrar tempo. Escolha um app e siga o guia de conexão.</p>
        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-gray-600"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" /> Você escolhe o acesso. O assistente respeita suas permissões no Operum e você pode desconectá-lo a qualquer momento.</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {guides.map(guide => (
          <details key={guide.id} id={`guia-${guide.id}`} className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm open:border-blue-200">
            <summary className="cursor-pointer list-none p-5 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${guide.color}`}>
                  <Image src={`/integrations/${guide.logo}.svg`} alt="" width={28} height={28} />
                </div>
                <div className="min-w-0 flex-1"><h3 className="text-base font-semibold text-gray-900">{guide.name}</h3><p className="mt-0.5 text-xs text-gray-500">{guide.surface}</p></div>
                <ChevronDown size={18} className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </div>
              <p className="mt-4 text-sm leading-6 text-gray-600">{guide.description}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{guide.method}</span><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700"><BookOpen size={14} aria-hidden="true" /> Como conectar</span></div>
            </summary>
            <div className="space-y-5 border-t border-gray-100 p-5 text-sm leading-6 text-gray-600">
              <div><h4 className="font-semibold text-gray-900">Antes de começar</h4><p className="mt-1">{guide.requirement}</p><p className="mt-2">Você também precisa de uma conta no Operum com acesso aos projetos que deseja usar. O login por OAuth precisa estar habilitado pelo administrador do Operum.</p></div>
              <div><h4 className="mb-2 font-semibold text-gray-900">Passo a passo</h4><ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-blue-600">{guide.steps.map(step => <li key={step} className="pl-1">{step}</li>)}</ol></div>
              <div><h4 className="mb-2 font-semibold text-gray-900">{guide.command ? 'Comandos de conexão' : 'URL do servidor MCP'}</h4><CopyConnectionValue value={guide.command ?? MCP_SERVER_URL} label={guide.command ? `comandos do ${guide.name}` : `URL para ${guide.name}`} /></div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4"><h4 className="font-semibold text-blue-900">Seu primeiro pedido</h4><p className="mt-1 text-blue-800">“Liste os meus projetos no Operum.”</p></div>
              <div><h4 className="font-semibold text-gray-900">Permissões e desconexão</h4><p className="mt-1">Só leitura permite consultar. Leitura e escrita permite criar e alterar, dentro do seu acesso aos projetos. Com OAuth, você pode selecionar várias instituições vinculadas à sua conta. Para encerrar o acesso, use Desconectar em Apps conectados abaixo.</p></div>
              <div><h4 className="font-semibold text-gray-900">Se algo não funcionar</h4><p className="mt-1">{guide.help}</p><p className="mt-2">Se um projeto não aparecer, confira a instituição autorizada e seu acesso ao projeto. Para ampliar as permissões, desconecte e autorize novamente.</p></div>
              <a href={guide.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-blue-700 hover:underline">Documentação do {guide.name}<ArrowUpRight size={15} aria-hidden="true" /></a>
            </div>
          </details>
        ))}
      </div>
      <p className="text-xs leading-5 text-gray-500">Outros clientes compatíveis com MCP remoto por HTTP podem usar a mesma URL, com OAuth ou token pessoal, conforme o suporte de cada app. A conexão nesses clientes depende de configuração e validação próprias. As marcas identificam os aplicativos; não indicam parceria ou endosso.</p>
    </section>
  )
}
