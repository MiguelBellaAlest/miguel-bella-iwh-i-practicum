# Integrating With HubSpot I: Foundations Practicum

Aplicação Node.js, Express, Axios, dotenv e Pug para listar, criar e editar Livros em uma developer test account HubSpot.

**HubSpot developer test account custom objects URL:** https://app.hubspot.com/contacts/52240235/objects/2-71933800/views/all/list

## Estado verificado em 2026-10-29

Conta de teste criada: **Foundations Practicum - Test**, Hub ID `52240235`. Objeto: **Livro / Livros**, nome interno `practicum_books`, ID `2-71933800`. Propriedades string/text: **Name** (`name`), **Author** (`author`) e **Genre** (`genre`). A configuração de criação inclui associação ao tipo Contacts.

Três livros foram cadastrados pela UI: Dom Casmurro, O Cortiço e Memórias Póstumas de Brás Cubas. O cadastro pela UI não valida a integração da aplicação local. **Private app criado e seis scopes confirmados.** Validação manual realizada por Miguel: a aplicação local listou os três registros existentes e exibiu o novo livro após o envio do formulário. Nenhum token real foi lido, copiado ou incluído no pacote.

## Como executar

1. Utilize somente uma developer test account HubSpot.
2. Use um fork público chamado `miguel-bella-iwh-i-practicum`, trabalhando em `working-branch`.
3. Execute `npm ci` com Node.js 20+.
4. Copie `.env.example` para `.env` e preencha somente o token da conta de teste. Os IDs já estão preenchidos.
5. Execute `npm test`, depois `npm start`, e abra http://localhost:3000.
6. Confirme a listagem dos três livros, crie um quarto pela aplicação e verifique o mesmo registro no HubSpot.
7. Faça commits reais, revise e integre manualmente em `main` antes de enviar.

Não é necessário `npm run setup`: o objeto já foi criado no navegador. Esse script permanece como utilitário alternativo para criar/reutilizar um schema compatível numa conta de teste autorizada. Nunca execute na produção. O script não apaga objetos nem registros.

O servidor só escuta em `127.0.0.1`, para uso local. Não é uma aplicação pronta para hospedar em produção.

## Private app criado

Nome: **Miguel’s Practicum Private App**. Os seis scopes abaixo foram confirmados na aba Autenticação após a criação.

Scopes:

- `crm.schemas.custom.read`
- `crm.schemas.custom.write`
- `crm.objects.custom.read`
- `crm.objects.custom.write`
- `crm.objects.contacts.read`
- `crm.objects.contacts.write`

Token deve ficar apenas no `.env` local, que é ignorado pelo Git. Não publique o token nem o inclua em logs ou screenshots.

## Routes e templates

| Método | Route | Resultado |
| --- | --- | --- |
| GET | `/` | Consulta os registros e renderiza a tabela em `homepage.pug`, com três properties e paginação. |
| GET | `/update-cobj` | Renderiza o formulário em `updates.pug`. |
| GET | `/update-cobj?id=ID` | Preenche o mesmo formulário para edição. |
| POST | `/update-cobj` | Cria registro via POST; com recordId, edita via PATCH. Redireciona para a homepage após sucesso. |

Título do formulário: `Update Custom Object Form | Integrating With HubSpot I Practicum`.

Link no topo da homepage: **Add to this table** → `/update-cobj`. Link no formulário: **Return to the homepage** → `/`.

Registros: `/crm/v3/objects/{objectTypeId}`. Schema: `/crm-object-schemas/v3/schemas`.

## Variáveis

| Variável | Uso |
| --- | --- |
| HUBSPOT_PRIVATE_APP_TOKEN | Token secreto da developer test account. |
| HUBSPOT_PORTAL_ID | Hub ID da conta de teste, preenchido. |
| HUBSPOT_OBJECT_TYPE_ID | ID do objeto criado, preenchido. |
| HUBSPOT_TEST_ACCOUNT_CONFIRMED | Confirmação explícita da conta de teste. O tipo da conta foi conferido na criação pela UI; o programa não o verifica automaticamente. |
| PORT | 3000 por padrão. |

## Testes e limites

`npm test` executa testes com respostas simuladas da API, sem token real. Cobre routes, templates, paginação, validação, criação/edição, erros, escape de HTML, proteção do token e setup de schema. A interface também foi testada localmente com mock de API.

A listagem e a criação foram verificadas manualmente por Miguel na aplicação conectada à conta de teste. A edição ainda não foi validada contra a API real. Não há envio à Academy, aprovação nem conclusão de certificação implícitos neste pacote.

## Origem e autoria

Boilerplate oficial: https://github.com/HubSpot-Academy/integrating-with-hubspot-i-foundations-practicum

As instruções autenticadas da Academy foram conferidas no navegador em 2026-10-29. O exercício exige trabalho próprio, histórico significativo de revisões, três routes, dois novos templates Pug, conta de teste, três registros, associação com Contacts e link do objeto no README. O envio é a URL pública do fork, não upload nem preview; não é necessário deploy.

Esta implementação foi preparada com assistência de IA. Não fabrique autoria, datas, commits ou resultados de teste. Confira a política vigente antes de enviar. Não há garantia de elegibilidade ou aprovação.
