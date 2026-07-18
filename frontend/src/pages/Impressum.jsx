import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "../context/I18nContext";

function getContent(lang) {
  const data = {
    pt: {
      title: "Informação Legal (Impressum)",
      updated: "Última atualização: Julho 2026",
      sections: [
        { heading: "Responsável pelo Serviço", body: "O Wallet76 é um serviço operado por José Oliveira, a título individual, em Moudon, cantão de Vaud, Suíça." },
        { heading: "Contacto", body: "Email: support@wallet76.com. Para questões de privacidade e proteção de dados, utilize o mesmo endereço." },
        { heading: "Estatuto Legal", body: "O Wallet76 é atualmente explorado por um particular. Não está inscrito no registo comercial nem sujeito a IVA, por se encontrar abaixo dos limiares legais aplicáveis na Suíça." },
        { heading: "Responsabilidade", body: "O Wallet76 é uma ferramenta informativa de acompanhamento de carteiras e não constitui aconselhamento financeiro. Apesar do cuidado na elaboração dos conteúdos, não é assumida qualquer responsabilidade pela exatidão, integridade ou atualidade dos dados fornecidos por terceiros. Consulte os Termos de Serviço e a Política de Privacidade para mais informação." },
      ],
    },
    fr: {
      title: "Mentions Légales (Impressum)",
      updated: "Dernière mise à jour : juillet 2026",
      sections: [
        { heading: "Responsable du service", body: "Wallet76 est un service exploité par José Oliveira, à titre individuel, à Moudon, canton de Vaud, Suisse." },
        { heading: "Contact", body: "E-mail : support@wallet76.com. Pour toute question relative à la confidentialité et aux données, veuillez utiliser la même adresse." },
        { heading: "Statut juridique", body: "Wallet76 est actuellement exploité par un particulier. Il n'est ni inscrit au registre du commerce ni assujetti à la TVA, se situant en dessous des seuils légaux applicables en Suisse." },
        { heading: "Responsabilité", body: "Wallet76 est un outil informatif de suivi de portefeuille et ne constitue pas un conseil financier. Malgré le soin apporté au contenu, aucune responsabilité n'est assumée quant à l'exactitude, l'exhaustivité ou l'actualité des données fournies par des tiers. Veuillez consulter les Conditions de Service et la Politique de Confidentialité." },
      ],
    },
    de: {
      title: "Impressum",
      updated: "Letzte Aktualisierung: Juli 2026",
      sections: [
        { heading: "Verantwortlich für den Dienst", body: "Wallet76 ist ein Dienst, der von José Oliveira als Privatperson in Moudon, Kanton Waadt, Schweiz, betrieben wird." },
        { heading: "Kontakt", body: "E-Mail: support@wallet76.com. Für Fragen zum Datenschutz verwenden Sie bitte dieselbe Adresse." },
        { heading: "Rechtlicher Status", body: "Wallet76 wird derzeit von einer Privatperson betrieben. Es ist weder im Handelsregister eingetragen noch mehrwertsteuerpflichtig, da die in der Schweiz geltenden Schwellenwerte nicht erreicht werden." },
        { heading: "Haftung", body: "Wallet76 ist ein informatives Portfolio-Tracking-Tool und stellt keine Finanzberatung dar. Trotz sorgfältiger Erstellung der Inhalte wird keine Haftung für die Richtigkeit, Vollständigkeit oder Aktualität der von Dritten bereitgestellten Daten übernommen. Bitte beachten Sie die Nutzungsbedingungen und die Datenschutzerklärung." },
      ],
    },
    it: {
      title: "Note Legali (Impressum)",
      updated: "Ultimo aggiornamento: luglio 2026",
      sections: [
        { heading: "Responsabile del servizio", body: "Wallet76 è un servizio gestito da José Oliveira, a titolo individuale, a Moudon, Canton Vaud, Svizzera." },
        { heading: "Contatto", body: "E-mail: support@wallet76.com. Per domande su privacy e protezione dei dati, si prega di utilizzare lo stesso indirizzo." },
        { heading: "Stato giuridico", body: "Wallet76 è attualmente gestito da un privato. Non è iscritto al registro di commercio né soggetto a IVA, trovandosi al di sotto delle soglie di legge applicabili in Svizzera." },
        { heading: "Responsabilità", body: "Wallet76 è uno strumento informativo di monitoraggio del portafoglio e non costituisce consulenza finanziaria. Nonostante la cura nella redazione dei contenuti, non si assume alcuna responsabilità per l'esattezza, la completezza o l'attualità dei dati forniti da terzi. Si vedano i Termini di Servizio e l'Informativa sulla Privacy." },
      ],
    },
    es: {
      title: "Aviso Legal (Impressum)",
      updated: "Última actualización: julio de 2026",
      sections: [
        { heading: "Responsable del servicio", body: "Wallet76 es un servicio operado por José Oliveira, a título individual, en Moudon, cantón de Vaud, Suiza." },
        { heading: "Contacto", body: "Correo: support@wallet76.com. Para cuestiones de privacidad y datos, utilice la misma dirección." },
        { heading: "Estatus legal", body: "Wallet76 es operado actualmente por un particular. No está inscrito en el registro mercantil ni sujeto a IVA, al situarse por debajo de los umbrales legales aplicables en Suiza." },
        { heading: "Responsabilidad", body: "Wallet76 es una herramienta informativa de seguimiento de carteras y no constituye asesoramiento financiero. A pesar del cuidado en la elaboración de los contenidos, no se asume responsabilidad alguna por la exactitud, integridad o actualidad de los datos proporcionados por terceros. Consulte los Términos de Servicio y la Política de Privacidad." },
      ],
    },
    en: {
      title: "Legal Notice (Impressum)",
      updated: "Last updated: July 2026",
      sections: [
        { heading: "Service Provider", body: "Wallet76 is a service operated by José Oliveira, as an individual, in Moudon, Canton of Vaud, Switzerland." },
        { heading: "Contact", body: "Email: support@wallet76.com. For privacy and data questions, please use the same address." },
        { heading: "Legal Status", body: "Wallet76 is currently operated by a private individual. It is neither entered in the commercial register nor subject to VAT, as it remains below the applicable Swiss thresholds." },
        { heading: "Liability", body: "Wallet76 is an informational portfolio-tracking tool and does not constitute financial advice. Despite careful preparation of the content, no liability is assumed for the accuracy, completeness or timeliness of data provided by third parties. Please refer to the Terms of Service and Privacy Policy." },
      ],
    },
  };
  return data[lang] || data.en;
}

export default function Impressum() {
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
          <Link to="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-zinc-400 transition-colors">Terms</Link>
          <Link to="/status" className="hover:text-zinc-400 transition-colors">Status</Link>
          <Link to="/" className="hover:text-zinc-400 transition-colors">Back to Wallet76</Link>
        </div>
      </div>
    </div>
  );
}
