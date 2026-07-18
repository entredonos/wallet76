import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "../context/I18nContext";

function getContent(lang) {
  if (lang === "pt") return {
    title: "Política de Privacidade",
    updated: "Última atualização: Junho 2025",
    sections: [
      { heading: "1. Quem Somos", body: "O Wallet76 é uma aplicação de acompanhamento de carteiras de investimento. Contacto: support@wallet76.com." },
      { heading: "2. Dados que Recolhemos", body: "Recolhemos os dados que fornece ao criar uma conta (nome, email, hash da password) e os dados financeiros que introduz (ativos, transações, alertas de preço). Também recolhemos registos básicos de utilização para operar e proteger o serviço." },
      { heading: "3. Como Usamos os Seus Dados", body: "Usamos os seus dados exclusivamente para prestar e melhorar o serviço Wallet76. Não vendemos nem partilhamos os seus dados pessoais com terceiros para fins de marketing." },
      { heading: "4. Armazenamento e Segurança", body: "Os seus dados são armazenados em servidores na União Europeia. Passwords com hash bcrypt. Chaves API de brokers encriptadas com AES-256." },
      { heading: "5. Cookies", body: "Usamos cookies estritamente necessários para manter a sessão e lembrar as suas preferências (língua, moeda). Não usamos cookies de publicidade ou rastreamento." },
      { heading: "6. Os Seus Direitos (RGPD)", body: "Ao abrigo do RGPD tem direito a: aceder aos seus dados, corrigir dados inexatos, solicitar eliminação, opor-se ao tratamento e portabilidade dos dados. Contacte-nos em support@wallet76.com." },
      { heading: "7. Retenção de Dados", body: "Mantemos os seus dados enquanto a conta estiver ativa. Ao eliminar a conta, todos os dados pessoais são apagados permanentemente em 30 dias." },
      { heading: "8. Serviços de Terceiros", body: "Usamos as APIs Yahoo Finance e CoinGecko para obter preços de mercado. Apenas os símbolos dos ativos são transmitidos, sem dados pessoais." },
      { heading: "9. Alterações à Política", body: "Podemos atualizar esta política. Notificaremos por email ou aviso na app com pelo menos 14 dias de antecedência em caso de alterações materiais." },
      { heading: "10. Contacto", body: "Dúvidas? Contacte-nos em support@wallet76.com." },
    ],
  };
  if (lang === "fr") return {
    title: "Politique de Confidentialité",
    updated: "Dernière mise à jour : Juin 2025",
    sections: [
      { heading: "1. Qui Sommes-Nous", body: "Wallet76 est une application de suivi de portefeuille d'investissement. Contact : support@wallet76.com." },
      { heading: "2. Données Collectées", body: "Nous collectons les informations que vous fournissez lors de la création d'un compte (nom, email, hash du mot de passe) et les données financières que vous saisissez. Nous collectons également des journaux d'utilisation de base." },
      { heading: "3. Utilisation des Données", body: "Nous utilisons vos données exclusivement pour fournir et améliorer le service Wallet76. Nous ne vendons ni ne partageons vos données personnelles à des tiers à des fins marketing." },
      { heading: "4. Stockage et Sécurité", body: "Vos données sont stockées sur des serveurs dans l'Union Européenne. Mots de passe hachés avec bcrypt. Clés API des brokers chiffrées avec AES-256." },
      { heading: "5. Cookies", body: "Nous utilisons uniquement des cookies strictement nécessaires pour maintenir votre session et mémoriser vos préférences. Aucun cookie publicitaire ou de traçage." },
      { heading: "6. Vos Droits (RGPD)", body: "Conformément au RGPD, vous avez le droit d'accéder à vos données, de les corriger, de les supprimer, de vous opposer au traitement et à la portabilité. Contactez-nous à support@wallet76.com." },
      { heading: "7. Conservation des Données", body: "Nous conservons vos données tant que votre compte est actif. En cas de suppression de compte, toutes les données personnelles sont effacées dans les 30 jours." },
      { heading: "8. Services Tiers", body: "Nous utilisons les API Yahoo Finance et CoinGecko pour les prix de marché. Seuls les symboles des actifs sont transmis, aucune donnée personnelle." },
      { heading: "9. Modifications", body: "Nous pouvons mettre à jour cette politique. Nous vous notifierons au moins 14 jours avant toute modification importante." },
      { heading: "10. Contact", body: "Questions ? Contactez-nous à support@wallet76.com." },
    ],
  };
  if (lang === "de") return {
    title: "Datenschutzerklärung",
    updated: "Zuletzt aktualisiert: Juni 2025",
    sections: [
      { heading: "1. Wer Wir Sind", body: "Wallet76 ist eine Anwendung zur Verfolgung von Anlageportfolios. Kontakt: support@wallet76.com." },
      { heading: "2. Erhobene Daten", body: "Wir erheben die Informationen, die Sie bei der Kontoerstellung angeben sowie die von Ihnen eingegebenen Finanzdaten. Außerdem erheben wir grundlegende Nutzungsprotokolle." },
      { heading: "3. Datennutzung", body: "Wir nutzen Ihre Daten ausschließlich zur Bereitstellung und Verbesserung des Wallet76-Dienstes. Wir verkaufen oder teilen Ihre persönlichen Daten nicht mit Dritten." },
      { heading: "4. Datenspeicherung und Sicherheit", body: "Ihre Daten werden auf Servern in der Europäischen Union gespeichert. Passwörter werden mit bcrypt gehasht. API-Schlüssel für Broker-Konten werden mit AES-256 verschlüsselt." },
      { heading: "5. Cookies", body: "Wir verwenden nur unbedingt notwendige Cookies, um Sie angemeldet zu halten und Ihre Einstellungen zu speichern. Keine Werbe- oder Tracking-Cookies." },
      { heading: "6. Ihre Rechte (DSGVO)", body: "Gemäß DSGVO haben Sie das Recht auf Auskunft, Berichtigung, Löschung, Widerspruch und Datenübertragbarkeit. Kontaktieren Sie uns unter support@wallet76.com." },
      { heading: "7. Datenspeicherdauer", body: "Wir speichern Ihre Daten so lange Ihr Konto aktiv ist. Nach Kontolöschung werden alle persönlichen Daten innerhalb von 30 Tagen dauerhaft gelöscht." },
      { heading: "8. Drittanbieter-Dienste", body: "Wir nutzen die Yahoo Finance und CoinGecko APIs für Marktpreise. Es werden nur Tickersymbole übertragen, keine persönlichen Daten." },
      { heading: "9. Änderungen", body: "Wir können diese Richtlinie aktualisieren. Bei wesentlichen Änderungen benachrichtigen wir Sie mindestens 14 Tage vorher." },
      { heading: "10. Kontakt", body: "Fragen? Kontaktieren Sie uns unter support@wallet76.com." },
    ],
  };
  if (lang === "it") return {
    title: "Informativa sulla Privacy",
    updated: "Ultimo aggiornamento: Giugno 2025",
    sections: [
      { heading: "1. Chi Siamo", body: "Wallet76 è un'applicazione per il monitoraggio del portafoglio di investimenti. Contatto: support@wallet76.com." },
      { heading: "2. Dati Raccolti", body: "Raccogliamo le informazioni fornite durante la creazione dell'account e i dati finanziari inseriti. Raccogliamo anche log di utilizzo di base." },
      { heading: "3. Utilizzo dei Dati", body: "Utilizziamo i tuoi dati esclusivamente per fornire e migliorare il servizio Wallet76. Non vendiamo né condividiamo i tuoi dati personali con terze parti." },
      { heading: "4. Archiviazione e Sicurezza", body: "I tuoi dati sono archiviati su server nell'Unione Europea. Le password vengono sottoposte ad hashing con bcrypt. Le chiavi API dei broker vengono cifrate con AES-256." },
      { heading: "5. Cookie", body: "Utilizziamo solo cookie strettamente necessari per mantenerti connesso e ricordare le tue preferenze. Nessun cookie pubblicitario o di tracciamento." },
      { heading: "6. I Tuoi Diritti (GDPR)", body: "Ai sensi del GDPR hai il diritto di accedere, correggere, cancellare i tuoi dati, opporti al trattamento e alla portabilità. Contattaci all'indirizzo support@wallet76.com." },
      { heading: "7. Conservazione dei Dati", body: "Conserviamo i tuoi dati finché il tuo account è attivo. In caso di eliminazione dell'account, tutti i dati personali vengono cancellati definitivamente entro 30 giorni." },
      { heading: "8. Servizi di Terze Parti", body: "Utilizziamo le API Yahoo Finance e CoinGecko per i prezzi di mercato. Vengono trasmessi solo i simboli degli asset, nessun dato personale." },
      { heading: "9. Modifiche", body: "Potremmo aggiornare questa informativa. Ti notificheremo almeno 14 giorni prima di modifiche sostanziali." },
      { heading: "10. Contatto", body: "Domande? Contattaci a support@wallet76.com." },
    ],
  };
  if (lang === "es") return {
    title: "Política de Privacidad",
    updated: "Última actualización: Junio 2025",
    sections: [
      { heading: "1. Quiénes Somos", body: "Wallet76 es una aplicación de seguimiento de portafolio de inversiones. Contacto: support@wallet76.com." },
      { heading: "2. Datos que Recopilamos", body: "Recopilamos la información que proporcionas al crear una cuenta (nombre, email, hash de contraseña) y los datos financieros que introduces (activos, transacciones, alertas de precio). También recopilamos registros básicos de uso para operar y proteger el servicio." },
      { heading: "3. Cómo Usamos tus Datos", body: "Usamos tus datos exclusivamente para prestar y mejorar el servicio Wallet76. No vendemos ni compartimos tus datos personales con terceros para fines de marketing." },
      { heading: "4. Almacenamiento y Seguridad", body: "Tus datos se almacenan en servidores en la Unión Europea. Contraseñas con hash bcrypt. Claves API de brokers cifradas con AES-256." },
      { heading: "5. Cookies", body: "Usamos solo cookies estrictamente necesarias para mantener tu sesión y recordar tus preferencias (idioma, divisa). No usamos cookies publicitarias ni de rastreo." },
      { heading: "6. Tus Derechos (RGPD)", body: "Bajo el RGPD tienes derecho a: acceder a tus datos, corregir datos inexactos, solicitar la eliminación, oponerte al tratamiento y a la portabilidad. Contacta con nosotros en support@wallet76.com." },
      { heading: "7. Retención de Datos", body: "Conservamos tus datos mientras tu cuenta esté activa. Al eliminar la cuenta, todos los datos personales se borran permanentemente en 30 días." },
      { heading: "8. Servicios de Terceros", body: "Usamos las APIs de Yahoo Finance y CoinGecko para obtener precios de mercado. Solo se transmiten los símbolos de los activos, sin datos personales." },
      { heading: "9. Cambios en la Política", body: "Podemos actualizar esta política. Te notificaremos por email o aviso en la app con al menos 14 días de antelación en caso de cambios materiales." },
      { heading: "10. Contacto", body: "¿Preguntas? Contacta con nosotros en support@wallet76.com." },
    ],
  };
  return {
    title: "Privacy Policy",
    updated: "Last updated: June 2025",
    sections: [
      { heading: "1. Who We Are", body: "Wallet76 is a personal finance and portfolio tracking application. Our registered contact email is support@wallet76.com." },
      { heading: "2. Data We Collect", body: "We collect the information you provide when creating an account (name, email address, password hash) and the financial data you choose to enter (portfolio holdings, transactions, price alerts). We also collect basic usage logs to operate and secure the service." },
      { heading: "3. How We Use Your Data", body: "We use your data exclusively to provide and improve the Wallet76 service. We do not sell, rent, or share your personal data with third parties for marketing purposes." },
      { heading: "4. Data Storage and Security", body: "Your data is stored on servers located in the European Union. Passwords are hashed using bcrypt. API keys for connected broker accounts are encrypted with AES-256 before storage." },
      { heading: "5. Cookies", body: "We use strictly necessary cookies to keep you logged in and remember your preferences (language, currency). We do not use advertising or tracking cookies." },
      { heading: "6. Your Rights (GDPR)", body: "Under the GDPR you have the right to: access your personal data; request correction of inaccurate data; request erasure; object to processing; and data portability. Email us at support@wallet76.com." },
      { heading: "7. Data Retention", body: "We retain your account data for as long as your account is active. If you delete your account, all personal data is permanently erased within 30 days." },
      { heading: "8. Third-Party Services", body: "We use Yahoo Finance and CoinGecko APIs to fetch market prices. These services receive only the ticker symbols you track, no personal information is transmitted." },
      { heading: "9. Changes to This Policy", body: "We may update this policy from time to time. We will notify you by email or in-app notice at least 14 days before material changes take effect." },
      { heading: "10. Contact", body: "Questions about this policy? Contact us at support@wallet76.com." },
    ],
  };
}

export default function PrivacyPolicy() {
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
          <Link to="/terms" className="hover:text-zinc-400 transition-colors">Terms of Service</Link>
          <Link to="/" className="hover:text-zinc-400 transition-colors">Back to Wallet76</Link>
        </div>
      </div>
    </div>
  );
}
