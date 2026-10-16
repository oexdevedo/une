const db = require('./db');

async function updateOfficialContract() {
  const database = await db.getDB();

  const title = 'Contrato de Mentoria Financeira - Ex Devedor';
  const description = 'Modelo oficial de mentoria financeira individual da Ex Devedor Tecnologia Educacional Ltda.';

  const content = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

Este documento visa clarificar e regular a nossa relação de Mentoria financeira, a favor da transparência, libertando-nos para aquilo que de fato importa.  
Seguem-se algumas informações importantes sobre o serviço a ser prestado. Por favor, leia e responda por e-mail assinado digitalmente.

CONTRATANTE: {{nome_cliente}}, CPF {{cpf}}, RG {{rg}}, residente e domiciliado em {{endereco}}. E-mail: {{email}}

CONTRATADA: Ex Devedor Tecnologia Educacional Ltda, CNPJ: 29.238.426.0001-60, com sede na SCN Quadra 01, Bloco A, Sala 1102, Parte nº 123, Pavmto: 11, Edif: Corp. Number One, Asa Norte, Brasília-DF, CEP 70711-900.  
As partes têm entre si justo e contratado a prestação de serviços abaixo descrita, com suas cláusulas e condições a seguir:

CLÁUSULA 1ª - DO OBJETO
Por meio deste contrato, a CONTRATADA se compromete a prestar ao CONTRATANTE os seguintes serviços:
• Mínimo de 18 sessões de mentoria individuais, durante 10 meses via chamada de vídeo (podendo ser por Meet, Skype ou Zoom);  
• As sessões têm duração de aproximadamente 1 hora, podendo durar mais tempo ou menos tempo conforme a demanda da sessão do dia;  
• Acesso por WhatsApp com a CONTRATADA para tirar dúvidas.

CLÁUSULA 2ª - DO PRAZO
O presente contrato terá validade de 10 (dez) meses, podendo ser renovado mediante concordância das partes por meio da celebração de termo aditivo.

CLÁUSULA 3ª - DA RETRIBUIÇÃO
Como contraprestação pelos serviços prestados, a CONTRATADA receberá a quantia total de {{valor_total}}, a ser paga pelo CONTRATANTE à CONTRATADA em {{parcelas_info}}, com vencimento todo dia {{dia_vencimento}} de cada mês, a partir de {{primeiro_vencimento}}.

O pagamento será efetuado por meio de transferência PIX para a chave oexdevedor@gmail.com, de titularidade de Ex Devedor.  
O CONTRATANTE deverá enviar o comprovante de pagamento para o e-mail exdevedor@exdevedor.com.br ou no WhatsApp (61) 99567-8329 no mesmo dia da realização da transferência.

CLÁUSULA 4ª – TOLERÂNCIA PARA ATRASOS
A CONTRATADA e o CONTRATANTE irão tolerar até 15 (quinze) minutos de atraso.  
Caso o CONTRATANTE ultrapasse o tempo de 15 (quinze) minutos e não apresentar o seu parecer, a sessão será marcada como concluída.

CLÁUSULA 5ª – PARA REMARCAR A SESSÃO
O CONTRATANTE deve informar à CONTRATADA sobre a necessidade de remarcar uma sessão com pelo menos 12 (doze) horas de antecedência para que um novo horário possa ser agendado.

CLÁUSULA 6ª - DAS GARANTIAS
A CONTRATADA se compromete em ensinar para o CONTRATANTE sobre como ministrar mentorias de mindset financeiro, finanças pessoais, formas de sair das dívidas e investimentos.  
§ 1º. É obrigação do CONTRATANTE comunicar à CONTRATADA qualquer alteração de fatos que influencie sua vida financeira, a título de assertividade do objetivo proposto.  
§ 2º. O CONTRATANTE tem ciência de que, para a mentoria ter sucesso, deve fazer todas as tarefas propostas pela CONTRATADA para que possa alcançar as metas propostas.  
§ 3º. O CONTRATANTE terá o direito de solicitar a devolução total do valor pago, caso decida desistir dos serviços contratados, desde que essa solicitação seja realizada dentro de um prazo de 7 (sete) dias corridos a partir da data da assinatura deste contrato.

Para efetuar a solicitação, o CONTRATANTE deverá enviar um e-mail formalizando a desistência, e a CONTRATADA se compromete a processar o reembolso integral no prazo de 10 (dez) dias úteis após a confirmação da solicitação.

CLÁUSULA 7ª - DAS OBRIGAÇÕES LEGAIS
As obrigações das referidas partes e suas responsabilidades:  
§ 1º. É obrigação da CONTRATADA providenciar todos os meios, materiais e equipamentos necessários à correta execução dos serviços;  
§ 2º. É obrigação da CONTRATADA sempre buscar métodos que funcionem para o CONTRATANTE;  
§ 3º. É obrigação do CONTRATANTE deixar a CONTRATADA ciente de todas as coisas que acontecerem em sua vida pessoal ou profissional que afetem a sua vida financeira;  
§ 4º. É obrigação do CONTRATANTE o fornecimento de toda e qualquer informação que julgue necessária a fim de assertividade do objetivo proposto;  
§ 5º. É obrigação do CONTRATANTE e da CONTRATADA manter o zelo pelo respeito e dignidade durante as sessões.

CLÁUSULA 8ª - DO CANCELAMENTO, DA INTERRUPÇÃO E DA SUSPENSÃO DOS SERVIÇOS
Caso o CONTRATANTE ou a CONTRATADA deseje rescindir o presente contrato, deverá fazê-lo formalmente, por escrito, e enviá-lo via e-mail exdevedor@exdevedor.com.br, com antecedência de 15 (quinze) dias úteis.  
§ 1º. Em caso de descumprimento das obrigações contratuais, a parte que causar o descumprimento se compromete a indenizar a parte inocente no montante correspondente a 15% do valor residual do contrato.

CLÁUSULA 9ª - DA CONFIDENCIALIDADE
As informações comerciais e contratuais são de cunho confidencial, bem como as transações financeiras realizadas, saldos e demais movimentações em conta corrente.  
Deste modo, a CONTRATADA e o CONTRATANTE lidarão com as informações pertinentes ao referido acordo de maneira sigilosa, não podendo em hipótese alguma divulgar qualquer dado/informação sensível.

CLÁUSULA 10ª – INÍCIO E TÉRMINO
A consultoria financeira pessoal entre a CONTRATADA e o CONTRATANTE terá início no dia {{data_inicio}} e tem como término de contrato o dia {{data_termino}}. Caso ambas as partes decidam prorrogar as consultorias, será emitido um novo contrato e este deixará de ser vigente.

CLÁUSULA 11ª - DO SIGILO E DA CIÊNCIA LEGAL MÚTUA
Todos os assuntos tratados durante a mentoria são considerados sigilosos. Nesse sentido, não podem ser divulgados sem a permissão do CONTRATANTE.  
PARÁGRAFO ÚNICO: A CONTRATADA se compromete a não enviar, transmitir, reproduzir e/ou aplicar qualquer outro modo de difusão das informações trocadas durante as reuniões on-line e as interlocuções por mensageiros eletrônicos (WhatsApp, e-mail, etc.), exceto mediante autorização expressa e por escrito do CONTRATANTE.  
O descumprimento desta obrigação poderá resultar nas penalidades previstas nas seguintes legislações e respectivos artigos:  

Lei Geral de Proteção de Dados Pessoais (LGPD) – Lei nº 13.709/2018:
• Art. 42: O tratamento de dados pessoais em desacordo com a LGPD poderá gerar a responsabilização civil da CONTRATADA, sujeitando-a à reparação de danos patrimoniais, morais, individuais ou coletivos.  
• Art. 44: O tratamento irregular de dados pode acarretar a aplicação de sanções administrativas, incluindo advertências e multas.

Código Civil – Lei nº 10.406/2002:
• Art. 186: Aquele que, por ação ou omissão voluntária, negligência ou imprudência, violar direito ou causar dano a outrem, comete ato ilícito, sendo obrigado a reparar os danos causados.  
• Art. 927: Aquele que causar dano a outrem, por ato ilícito, fica obrigado a repará-lo.

Marco Civil da Internet – Lei nº 12.965/2014:
• Art. 7º, inciso I: O usuário tem direito à inviolabilidade e ao sigilo de suas comunicações privadas pela internet, salvo por ordem judicial.  
• Art. 10: A guarda e o fornecimento de registros de comunicação eletrônica devem respeitar a proteção à privacidade e à intimidade, sob pena de sanções civis e penais.

Lei de Propriedade Intelectual – Lei nº 9.610/1998:
• Art. 7º: Protege as obras intelectuais, incluindo o conteúdo trocado em reuniões, que são consideradas propriedade intelectual, sendo proibida a reprodução não autorizada.

Essas legislações garantem a proteção da privacidade, confidencialidade e integridade das informações trocadas entre as partes, com previsão de sanções no caso de descumprimento, estando CONTRATADA e CONTRATANTE cientes das supracitadas leis, em específico.

CLÁUSULA 12ª - DO FORO
Fica já eleito o foro da comarca de Brasília, DF, para serem resolvidas eventuais pendências decorrentes deste contrato.

Brasília/DF, {{data_atual}}.

____________________________________________
{{nome_cliente}}
CONTRATANTE

____________________________________________
Ex Devedor Tecnologia Educacional Ltda
CONTRATADA`;

  const variables = [
    { key: 'nome_cliente', label: 'Nome Completo do Contratante', prompt: 'Para começarmos a confecção do seu contrato de mentoria, qual é o seu *nome completo*?', type: 'text', required: true },
    { key: 'cpf', label: 'CPF do Contratante', prompt: 'Perfeito! Qual é o seu número de *CPF*?', type: 'text', required: true },
    { key: 'rg', label: 'RG do Contratante', prompt: 'Poderia me informar o seu *RG* (número e órgão expedidor)?', type: 'text', required: true },
    { key: 'endereco', label: 'Endereço Completo com CEP', prompt: 'Qual é o seu *endereço completo* (com rua/quadra, número, complemento, bairro, cidade e CEP)?', type: 'text', required: true },
    { key: 'email', label: 'E-mail de Contato', prompt: 'Qual o seu melhor *e-mail* para envio do contrato e comunicações?', type: 'text', required: true },
    { key: 'valor_total', label: 'Valor Total da Mentoria', prompt: 'Qual é o *valor total* acordado da sua mentoria (ex: R$ 2.200,00)?', type: 'text', required: true },
    { key: 'parcelas_info', label: 'Forma de Parcelamento', prompt: 'Como será o parcelamento das parcelas (ex: 10 parcelas mensais de R$ 220,00 ou à vista)?', type: 'text', required: true },
    { key: 'dia_vencimento', label: 'Dia do Vencimento Mensal', prompt: 'Qual o melhor *dia de vencimento* mensal (ex: dia 10, dia 20 ou dia 28)?', type: 'text', required: true },
    { key: 'primeiro_vencimento', label: 'Data da Primeira Parcela', prompt: 'Qual a data de vencimento da *primeira parcela* (ex: 28/10/2026)?', type: 'text', required: true },
    { key: 'data_inicio', label: 'Data de Início da Mentoria', prompt: 'A partir de qual data iniciaremos as consultorias (ex: 17/10/2026)?', type: 'text', required: true },
    { key: 'data_termino', label: 'Data de Término da Mentoria', prompt: 'Qual a data de término prevista do contrato (ex: 17/08/2027)?', type: 'text', required: true }
  ];

  // Atualiza o modelo ID 1
  await database.run(
    `UPDATE contract_templates 
     SET title = ?, description = ?, content = ?, variables = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [title, description, content, JSON.stringify(variables)]
  );

  console.log('✅ Modelo oficial de Contrato de Mentoria da Ex Devedor atualizado com sucesso no ID 1!');
}

updateOfficialContract().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
