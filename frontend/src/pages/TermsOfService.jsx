import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "../context/I18nContext";

function getContent(lang) {
  if (lang === "pt") return {
    title: "Termos de Serviço",
    updated: "Última atualização: Junho 2025",
    sections: [
      { heading: "1. Aceitação dos Termos", body: "Ao aceder ou utilizar o Wallet76, concorda com estes Termos de Serviço. Se não concordar, não utilize o serviço." },
      { heading: "2. Descrição do Serviço", body: "O Wallet76 é uma ferramenta de acompanhamento de carteiras de investimento. Agrega dados financeiros de APIs de terceiros apenas para fins informativos. O Wallet76 não é um consultor financeiro licenciado." },
      { heading: "3. Não É Aconselhamento Financeiro", body: "Nada no Wallet76 constitui aconselhamento financeiro, de investimento, jurídico ou fiscal. É o único responsável pelas suas decisões de investimento." },
      { heading: "4. Responsabilidades da Conta", body: "É responsável pela confidencialidade das suas credenciais e por toda a atividade na sua conta. Notifique-nos imediatamente de qualquer utilização não autorizada em support@wallet76.com." },
      { heading: "5. Uso Aceitável", body: "Concorda em não utilizar o serviço para fins ilegais, não tentar aceder sem autorização, não fazer engenharia reversa da API, e não interferir com o funcionamento do serviço." },
      { heading: "6. Subscrição e Faturação", body: "O Wallet76 oferece um plano gratuito e uma subscrição Pro, faturada mensal ou anualmente. Ao subscrever, autoriza a cobrança recorrente através do método de pagamento fornecido; as subscrições renovam-se automaticamente no início de cada período, salvo cancelamento. Pode cancelar a qualquer momento nas definições da conta ou contactando support@wallet76.com — o cancelamento impede renovações futuras e mantém o acesso Pro até ao fim do período que já pagou. Os novos subscritores podem pedir o reembolso total nos 14 dias seguintes ao primeiro pagamento, por qualquer motivo, ao abrigo do direito de retração da UE — basta escrever para support@wallet76.com e devolvemos o valor. Após esses 14 dias, e nas renovações automáticas, pode sempre cancelar para evitar cobranças futuras; analisamos ainda pedidos de reembolso individuais em support@wallet76.com e concedemos qualquer reembolso exigido pela lei aplicável. Os preços só podem ser alterados mediante aviso prévio razoável, aplicando-se os novos preços apenas a períodos de faturação futuros." },
      { heading: "7. Precisão dos Dados", body: "Os preços de mercado e análises são fornecidos sem garantias de precisão ou atualidade. Dependemos de fornecedores de dados terceiros." },
      { heading: "8. Propriedade Intelectual", body: "Todo o conteúdo, marcas e código do Wallet76 são da nossa propriedade ou licenciados para nós. Não pode reproduzir ou distribuir sem permissão escrita." },
      { heading: "9. Limitação de Responsabilidade", body: "Na máxima extensão permitida por lei, o Wallet76 não é responsável por quaisquer danos indiretos, incluindo perdas de investimento." },
      { heading: "10. Rescisão", body: "Reservamo-nos o direito de suspender ou encerrar a sua conta em caso de violação destes Termos. Pode eliminar a sua conta a qualquer momento nas Definições." },
      { heading: "11. Lei Aplicável", body: "Estes Termos são regidos pela lei suíça, com exclusão das suas regras de conflito de leis. O foro competente é Moudon, cantão de Vaud, Suíça. Se for um consumidor, beneficia igualmente das disposições imperativas de proteção do consumidor do seu país de residência." },
      { heading: "12. Alterações aos Termos", body: "Podemos modificar estes Termos com pelo menos 14 dias de aviso prévio para alterações materiais." },
      { heading: "13. Contacto", body: "Dúvidas? Contacte-nos em support@wallet76.com." },
    ],
  };
  if (lang === "fr") return {
    title: "Conditions d'Utilisation",
    updated: "Dernière mise à jour : Juin 2025",
    sections: [
      { heading: "1. Acceptation des Conditions", body: "En accédant à Wallet76, vous acceptez ces Conditions d'Utilisation. Si vous n'êtes pas d'accord, veuillez ne pas utiliser le service." },
      { heading: "2. Description du Service", body: "Wallet76 est un outil de suivi de portefeuille d'investissement agrégeant des données financières de tiers à titre informatif uniquement. Wallet76 n'est pas un conseiller financier agréé." },
      { heading: "3. Pas de Conseil Financier", body: "Rien sur Wallet76 ne constitue un conseil financier ou d'investissement. Vous êtes seul responsable de vos décisions d'investissement." },
      { heading: "4. Responsabilités du Compte", body: "Vous êtes responsable de la confidentialité de vos identifiants. Informez-nous immédiatement de toute utilisation non autorisée à support@wallet76.com." },
      { heading: "5. Utilisation Acceptable", body: "Vous acceptez de ne pas utiliser le service à des fins illégales, de ne pas tenter un accès non autorisé et de ne pas perturber le service." },
      { heading: "6. Abonnement et Facturation", body: "Wallet76 propose un niveau gratuit et un abonnement Pro, facturé mensuellement ou annuellement. En souscrivant, vous autorisez le prélèvement récurrent sur le moyen de paiement fourni ; les abonnements se renouvellent automatiquement au début de chaque période, sauf résiliation. Vous pouvez résilier à tout moment dans les paramètres du compte ou en écrivant à support@wallet76.com — la résiliation empêche les renouvellements futurs et vous conservez l’accès Pro jusqu’à la fin de la période déjà payée. Les nouveaux abonnés peuvent demander un remboursement intégral dans les 14 jours suivant le premier paiement, pour tout motif, conformément au droit de rétractation de l’UE — il suffit d’écrire à support@wallet76.com et nous vous remboursons. Passé ce délai de 14 jours, et pour les renouvellements automatiques, vous pouvez toujours résilier pour éviter des frais futurs ; nous examinons également les demandes de remboursement individuelles à support@wallet76.com et accordons tout remboursement exigé par le droit applicable. Les prix ne peuvent être modifiés que moyennant un préavis raisonnable, les nouveaux prix ne s’appliquant qu’aux périodes de facturation futures." },
      { heading: "7. Exactitude des Données", body: "Les prix de marché et analyses sont fournis sans garantie d'exactitude ou de disponibilité." },
      { heading: "8. Propriété Intellectuelle", body: "Tout le contenu et code de Wallet76 nous appartiennent ou nous sont licenciés. Toute reproduction est interdite sans permission écrite." },
      { heading: "9. Limitation de Responsabilité", body: "Dans toute la mesure permise par la loi, Wallet76 ne sera pas responsable des dommages indirects, y compris les pertes d'investissement." },
      { heading: "10. Résiliation", body: "Nous nous réservons le droit de résilier votre compte en cas de violation. Vous pouvez supprimer votre compte à tout moment dans les Paramètres." },
      { heading: "11. Droit Applicable", body: "Ces Conditions sont régies par le droit suisse, à l'exclusion de ses règles de conflit de lois. Le for compétent est Moudon, canton de Vaud, Suisse. Si vous êtes un consommateur, vous bénéficiez en outre des dispositions impératives de protection des consommateurs de votre pays de résidence." },
      { heading: "12. Modifications", body: "Nous pouvons modifier ces Conditions avec un préavis d'au moins 14 jours pour les modifications importantes." },
      { heading: "13. Contact", body: "Questions ? Contactez-nous à support@wallet76.com." },
    ],
  };
  if (lang === "de") return {
    title: "Nutzungsbedingungen",
    updated: "Zuletzt aktualisiert: Juni 2025",
    sections: [
      { heading: "1. Akzeptanz der Bedingungen", body: "Durch den Zugriff auf Wallet76 stimmen Sie diesen Nutzungsbedingungen zu. Wenn Sie nicht einverstanden sind, nutzen Sie den Dienst bitte nicht." },
      { heading: "2. Beschreibung des Dienstes", body: "Wallet76 ist ein Tool zur Verfolgung von Anlageportfolios. Es aggregiert Finanzdaten von Drittanbietern nur zu Informationszwecken. Wallet76 ist kein lizenzierter Finanzberater." },
      { heading: "3. Keine Finanzberatung", body: "Nichts auf Wallet76 stellt Finanz- oder Anlageberatung dar. Sie sind allein verantwortlich für Ihre Anlageentscheidungen." },
      { heading: "4. Kontoverantwortung", body: "Sie sind für die Vertraulichkeit Ihrer Zugangsdaten verantwortlich. Informieren Sie uns unverzüglich über unbefugte Nutzung unter support@wallet76.com." },
      { heading: "5. Zulässige Nutzung", body: "Sie stimmen zu, den Dienst nicht für illegale Zwecke zu nutzen, keinen unbefugten Zugriff zu versuchen und den Betrieb des Dienstes nicht zu stören." },
      { heading: "6. Abonnement und Abrechnung", body: "Wallet76 bietet eine kostenlose Version und ein Pro-Abonnement, das monatlich oder jährlich abgerechnet wird. Mit dem Abschluss ermächtigen Sie uns zur wiederkehrenden Abbuchung über das angegebene Zahlungsmittel; Abonnements verlängern sich zu Beginn jeder Periode automatisch, sofern nicht gekündigt wird. Sie können jederzeit in den Kontoeinstellungen oder per E-Mail an support@wallet76.com kündigen — die Kündigung verhindert künftige Verlängerungen und Ihr Pro-Zugang bleibt bis zum Ende der bereits bezahlten Periode bestehen. Neue Abonnenten können innerhalb von 14 Tagen nach der ersten Zahlung ohne Angabe von Gründen eine vollständige Rückerstattung verlangen, im Einklang mit dem Widerrufsrecht der EU — schreiben Sie einfach an support@wallet76.com und wir erstatten Ihnen den Betrag. Nach diesen 14 Tagen und bei automatischen Verlängerungen können Sie jederzeit kündigen, um künftige Abbuchungen zu vermeiden; außerdem prüfen wir einzelne Rückerstattungsanträge an support@wallet76.com und gewähren jede nach geltendem Recht erforderliche Rückerstattung. Preise können nur mit angemessener Vorankündigung geändert werden, wobei neue Preise nur für künftige Abrechnungsperioden gelten." },
      { heading: "7. Datengenauigkeit", body: "Marktpreise und Analysen werden ohne Garantien für Genauigkeit oder Verfügbarkeit bereitgestellt." },
      { heading: "8. Geistiges Eigentum", body: "Alle Inhalte und Codes von Wallet76 sind unser Eigentum oder uns lizenziert. Eine Vervielfältigung ohne schriftliche Genehmigung ist nicht gestattet." },
      { heading: "9. Haftungsbeschränkung", body: "Im gesetzlich zulässigen Umfang haftet Wallet76 nicht für indirekte Schäden, einschließlich Anlageverluste." },
      { heading: "10. Kündigung", body: "Wir behalten uns das Recht vor, Ihr Konto bei Verstößen zu sperren. Sie können Ihr Konto jederzeit in den Einstellungen löschen." },
      { heading: "11. Anwendbares Recht", body: "Diese Bedingungen unterliegen dem schweizerischen Recht unter Ausschluss seiner Kollisionsnormen. Gerichtsstand ist Moudon, Kanton Waadt, Schweiz. Als Verbraucher genießen Sie zudem die zwingenden Verbraucherschutzbestimmungen Ihres Wohnsitzlandes." },
      { heading: "12. Änderungen", body: "Wir können diese Bedingungen mit mindestens 14 Tagen Vorankündigung bei wesentlichen Änderungen anpassen." },
      { heading: "13. Kontakt", body: "Fragen? Kontaktieren Sie uns unter support@wallet76.com." },
    ],
  };
  if (lang === "it") return {
    title: "Termini di Servizio",
    updated: "Ultimo aggiornamento: Giugno 2025",
    sections: [
      { heading: "1. Accettazione dei Termini", body: "Accedendo a Wallet76, accetti questi Termini di Servizio. Se non sei d'accordo, non utilizzare il servizio." },
      { heading: "2. Descrizione del Servizio", body: "Wallet76 è uno strumento di monitoraggio del portafoglio di investimenti che aggrega dati finanziari da API di terze parti solo a scopo informativo. Non è un consulente finanziario autorizzato." },
      { heading: "3. Non è Consulenza Finanziaria", body: "Nulla su Wallet76 costituisce consulenza finanziaria o di investimento. Sei l'unico responsabile delle tue decisioni di investimento." },
      { heading: "4. Responsabilità dell'Account", body: "Sei responsabile della riservatezza delle tue credenziali. Notificaci immediatamente qualsiasi uso non autorizzato a support@wallet76.com." },
      { heading: "5. Uso Accettabile", body: "Accetti di non utilizzare il servizio per scopi illegali, di non tentare accessi non autorizzati e di non interferire con il funzionamento del servizio." },
      { heading: "6. Abbonamento e Fatturazione", body: "Wallet76 offre un piano gratuito e un abbonamento Pro, fatturato mensilmente o annualmente. Sottoscrivendo, autorizzi l’addebito ricorrente sul metodo di pagamento fornito; gli abbonamenti si rinnovano automaticamente all’inizio di ogni periodo, salvo disdetta. Puoi disdire in qualsiasi momento dalle impostazioni dell’account o scrivendo a support@wallet76.com — la disdetta impedisce i rinnovi futuri e mantieni l’accesso Pro fino al termine del periodo già pagato. I nuovi abbonati possono richiedere il rimborso completo entro 14 giorni dal primo pagamento, per qualsiasi motivo, in conformità al diritto di recesso dell’UE — basta scrivere a support@wallet76.com e ti rimborseremo. Trascorsi tali 14 giorni, e per i rinnovi automatici, puoi sempre disdire per evitare addebiti futuri; valutiamo inoltre le singole richieste di rimborso a support@wallet76.com e concediamo qualsiasi rimborso richiesto dalla legge applicabile. I prezzi possono essere modificati solo con un ragionevole preavviso, applicandosi i nuovi prezzi solo ai periodi di fatturazione futuri." },
      { heading: "7. Accuratezza dei Dati", body: "I prezzi di mercato e le analisi sono forniti senza garanzie di accuratezza o disponibilità." },
      { heading: "8. Proprietà Intellettuale", body: "Tutti i contenuti e il codice di Wallet76 sono di nostra proprietà o a noi concessi in licenza. La riproduzione senza permesso scritto è vietata." },
      { heading: "9. Limitazione di Responsabilità", body: "Nella misura massima consentita dalla legge, Wallet76 non sarà responsabile per danni indiretti, incluse le perdite di investimento." },
      { heading: "10. Risoluzione", body: "Ci riserviamo il diritto di sospendere il tuo account in caso di violazioni. Puoi eliminare il tuo account in qualsiasi momento dalle Impostazioni." },
      { heading: "11. Legge Applicabile", body: "Questi Termini sono regolati dal diritto svizzero, con esclusione delle sue norme sui conflitti di legge. Il foro competente è Moudon, Canton Vaud, Svizzera. Se sei un consumatore, benefici inoltre delle disposizioni imperative di tutela dei consumatori del tuo paese di residenza." },
      { heading: "12. Modifiche", body: "Potremmo modificare questi Termini con almeno 14 giorni di preavviso per modifiche sostanziali." },
      { heading: "13. Contatto", body: "Domande? Contattaci a support@wallet76.com." },
    ],
  };
  if (lang === "es") return {
    title: "Términos de Servicio",
    updated: "Última actualización: Junio 2025",
    sections: [
      { heading: "1. Aceptación de los Términos", body: "Al acceder o utilizar Wallet76, aceptas estos Términos de Servicio. Si no estás de acuerdo, no utilices el servicio." },
      { heading: "2. Descripción del Servicio", body: "Wallet76 es una herramienta de seguimiento de portafolio de inversiones que agrega datos financieros de APIs de terceros solo con fines informativos. Wallet76 no es un asesor financiero autorizado." },
      { heading: "3. No es Asesoramiento Financiero", body: "Nada en Wallet76 constituye asesoramiento financiero, de inversión, legal o fiscal. Eres el único responsable de tus decisiones de inversión." },
      { heading: "4. Responsabilidades de la Cuenta", body: "Eres responsable de la confidencialidad de tus credenciales y de toda la actividad bajo tu cuenta. Notifícanos inmediatamente cualquier uso no autorizado en support@wallet76.com." },
      { heading: "5. Uso Aceptable", body: "Aceptas no utilizar el servicio para fines ilegales, no intentar accesos no autorizados, no realizar ingeniería inversa de la API, y no interferir con el funcionamiento del servicio." },
      { heading: "6. Suscripción y Facturación", body: "Wallet76 ofrece un plan gratuito y una suscripción Pro, facturada mensual o anualmente. Al suscribirte, autorizas el cobro recurrente en el método de pago proporcionado; las suscripciones se renuevan automáticamente al inicio de cada período, salvo cancelación. Puedes cancelar en cualquier momento en los ajustes de la cuenta o escribiendo a support@wallet76.com — la cancelación impide futuras renovaciones y mantienes el acceso Pro hasta el final del período que ya pagaste. Los nuevos suscriptores pueden solicitar el reembolso íntegro dentro de los 14 días siguientes al primer pago, por cualquier motivo, conforme al derecho de desistimiento de la UE — basta con escribir a support@wallet76.com y te devolvemos el importe. Pasados esos 14 días, y en las renovaciones automáticas, siempre puedes cancelar para evitar cargos futuros; además, evaluamos las solicitudes de reembolso individuales en support@wallet76.com y concedemos cualquier reembolso exigido por la ley aplicable. Los precios solo pueden modificarse con un preaviso razonable, aplicándose los nuevos precios únicamente a períodos de facturación futuros." },
      { heading: "7. Exactitud de los Datos", body: "Los precios de mercado y análisis se proporcionan sin garantías de exactitud o puntualidad. Dependemos de proveedores de datos de terceros." },
      { heading: "8. Propiedad Intelectual", body: "Todo el contenido, marcas y código de Wallet76 son de nuestra propiedad o nos han sido licenciados. No puedes reproducirlos ni distribuirlos sin permiso escrito." },
      { heading: "9. Limitación de Responsabilidad", body: "En la máxima medida permitida por la ley, Wallet76 no será responsable de daños indirectos, incluidas pérdidas de inversión." },
      { heading: "10. Resolución", body: "Nos reservamos el derecho de suspender o cancelar tu cuenta por incumplimiento de estos Términos. Puedes eliminar tu cuenta en cualquier momento desde Configuración." },
      { heading: "11. Ley Aplicable", body: "Estos Términos se rigen por el derecho suizo, con exclusión de sus normas de conflicto de leyes. El fuero competente es Moudon, cantón de Vaud, Suiza. Si eres un consumidor, disfrutas además de las disposiciones imperativas de protección al consumidor de tu país de residencia." },
      { heading: "12. Cambios en los Términos", body: "Podemos modificar estos Términos con al menos 14 días de aviso previo para cambios materiales." },
      { heading: "13. Contacto", body: "¿Preguntas sobre estos Términos? Contacta con nosotros en support@wallet76.com." },
    ],
  };
  return {
    title: "Terms of Service",
    updated: "Last updated: June 2025",
    sections: [
      { heading: "1. Acceptance of Terms", body: "By accessing or using Wallet76, you agree to be bound by these Terms of Service. If you do not agree, please do not use the service." },
      { heading: "2. Description of Service", body: "Wallet76 is a personal portfolio tracking and analytics tool. It aggregates financial data from third-party APIs for informational purposes only. Wallet76 is not a licensed financial advisor, broker, or investment manager." },
      { heading: "3. Not Financial Advice", body: "Nothing on Wallet76 constitutes financial, investment, legal, or tax advice. You are solely responsible for your investment decisions." },
      { heading: "4. Account Responsibilities", body: "You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Notify us immediately of any unauthorised use at support@wallet76.com." },
      { heading: "5. Acceptable Use", body: "You agree not to use the service for any unlawful purpose, attempt unauthorised access, reverse-engineer the API, or interfere with the operation of the service." },
      { heading: "6. Subscription and Billing", body: "Wallet76 offers a free tier and a Pro subscription, billed monthly or annually. By subscribing, you authorise recurring charges to the payment method provided; subscriptions renew automatically at the start of each period unless cancelled. You can cancel at any time in your account settings or by emailing support@wallet76.com — cancellation stops future renewals, and you keep Pro access until the end of the period you have already paid for. New subscribers may request a full refund within 14 days of their first payment for any reason, in line with the EU right of withdrawal — just email support@wallet76.com and we will refund you. After those 14 days, and for automatic renewals, you can still cancel at any time to avoid future charges; we also review individual refund requests at support@wallet76.com and provide any refund required by applicable law. Prices may change only with reasonable prior notice, and new prices apply only to future billing periods." },
      { heading: "7. Data Accuracy", body: "Market prices, portfolio valuations, and analytics are provided without guarantees of accuracy or timeliness. We rely on third-party data providers." },
      { heading: "8. Intellectual Property", body: "All content, trademarks, and code comprising Wallet76 are owned by or licensed to us. You may not reproduce or distribute without our written permission." },
      { heading: "9. Limitation of Liability", body: "To the maximum extent permitted by law, Wallet76 shall not be liable for any indirect, incidental, or consequential damages, including any investment losses." },
      { heading: "10. Termination", body: "We reserve the right to suspend or terminate your account for violations of these Terms. You may delete your account at any time from Settings." },
      { heading: "11. Governing Law", body: "These Terms are governed by Swiss law, excluding its conflict-of-law rules. The place of jurisdiction is Moudon, Canton of Vaud, Switzerland. If you are a consumer, you also benefit from the mandatory consumer-protection provisions of your country of residence." },
      { heading: "12. Changes to Terms", body: "We may modify these Terms at any time with at least 14 days notice of material changes via email or in-app notification." },
      { heading: "13. Contact", body: "Questions about these Terms? Contact us at support@wallet76.com." },
    ],
  };
}

export default function TermsOfService() {
  const { lang } = useI18n();
  const c = getContent(lang);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Wallet76
        </Link>
        <h1 className="text-3xl font-bold text-zinc-100 mb-2">{c.title}</h1>
        <p className="text-sm text-zinc-500 mb-10">{c.updated}</p>
        <div className="space-y-8">
          {c.sections.map((s) => (
            <div key={s.heading}>
              <h2 className="text-lg font-semibold text-zinc-200 mb-2">{s.heading}</h2>
              <p className="text-zinc-400 leading-relaxed text-sm">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-8 border-t border-zinc-800 flex gap-6 text-xs text-zinc-600">
          <Link to="/privacy" className="hover:text-zinc-400 transition-colors">Privacy Policy</Link>
          <Link to="/impressum" className="hover:text-zinc-400 transition-colors">Impressum</Link>
          <Link to="/status" className="hover:text-zinc-400 transition-colors">Status</Link>
          <Link to="/" className="hover:text-zinc-400 transition-colors">Back to Wallet76</Link>
        </div>
      </div>
    </div>
  );
}
