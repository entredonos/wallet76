import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../context/I18nContext";
import logo from "../assets/wallet76-logo.png";
import {
  Bell, Globe2, Wallet, ShieldCheck, MonitorSmartphone,
  Lock, Server, FileText, RefreshCw, Newspaper, PieChart, Zap,
  Users, Star, ChevronRight, BarChart2, Activity, Check, X, BarChart3,
  Download, Share, SquarePlus, Eye, Smartphone, Baby, Heart, Bitcoin,
} from "lucide-react";
import {
  detectPlatform, isInstalled, canPromptInstall,
  subscribeInstallState, triggerInstall,
} from "../lib/pwaInstall";

// Chave localStorage: só mostramos o modal de instalação uma vez por
// browser (para não interromper o "Entrar"/"Começar" em toda visita) —
// depois de fechado (instalado ou não), fica marcado como visto.
const INSTALL_SEEN_KEY = "w76_install_prompt_seen";

const LANGS_LIST = {
  en: ["English", "Português", "Français", "Deutsch", "Italiano", "Español"],
  pt: ["Inglês", "Português", "Francês", "Alemão", "Italiano", "Espanhol"],
  fr: ["Anglais", "Portugais", "Français", "Allemand", "Italien", "Espagnol"],
  de: ["Englisch", "Portugiesisch", "Französisch", "Deutsch", "Italienisch", "Spanisch"],
  it: ["Inglese", "Portoghese", "Francese", "Tedesco", "Italiano", "Spagnolo"],
  es: ["Inglés", "Portugués", "Francés", "Alemán", "Italiano", "Español"],
};

const COPY = {
  en: {
    nav_features: "Features", nav_security: "Security", nav_pricing: "Pricing",
    nav_login: "Sign in", nav_start: "Start for free",
    badge: "Your investments. One place. Full control.",
    hero1: "The smarter way", hero2: "to track your wealth.",
    hero_sub: "Wallet76 is the professional-grade portfolio tracker built for serious investors. Real-time prices, multi-broker sync, advanced analytics and price alerts — all encrypted, GDPR-compliant, and yours alone.",
    cta_primary: "Start free — no credit card", cta_secondary: "See how it works",
    trust1: "AES-256 Encrypted", trust2: "GDPR Compliant", trust3: "EU Servers", trust4: "No ads. Ever.",
    trust5: "Read-only — we can never move your money",
    sec_badge: "Bank-grade security",
    mock_balance: "Total Balance", mock_invested: "Invested", mock_pnl: "Total P&L", mock_today: "Today",
    mock_top: "TOP PERFORMERS", mock_alloc: "ALLOCATION",
    mock_stocks: "Stocks", mock_crypto: "Crypto", mock_etf: "ETF",
    mock_alert: "NVDA crossed $950 target",
    feat_title: "Everything you need to invest smarter",
    feat_sub: "From real-time tracking to deep analytics — Wallet76 puts institutional-grade tools in your hands.",
    features: [
      { title: "Multi-Asset Portfolio", body: "Track stocks, ETFs, crypto, funds, bonds and cash in one unified dashboard. Supports US, European (Euronext, LSE, Xetra) and global crypto markets." },
      { title: "Real-Time Price Alerts", body: "Set price targets with above/below conditions and get notified by email the instant an asset crosses your threshold. Never miss a buy or sell opportunity again." },
      { title: "Advanced Analytics", body: "Measure true performance with CAGR, Sharpe ratio, maximum drawdown, volatility and benchmark comparison vs S&P 500, BTC and more." },
      { title: "Multi-Wallet Organisation", body: "Separate investments into distinct portfolios — retirement, growth, crypto, speculation. Switch instantly and see consolidated or individual views." },
      { title: "Broker & Exchange Sync", body: "Connect DEGIRO, Interactive Brokers, Trading 212, Binance, Coinbase and Kraken directly. Or import from any other broker via CSV or XLSX — we support all major export formats." },
      { title: "Market Intelligence", body: "Live market movers, top gainers and losers, and curated financial news personalised to your holdings — all in one feed." },
      { title: "Deep Asset Research", body: "Click any asset to see analyst consensus, price targets, key metrics (P/E, EPS, Beta, 52W range, dividend yield) plus interactive charts across 11 time ranges." },
      { title: "6 Languages & 4 Currencies", body: "Full interface in English, Portuguese, French, German, Italian and Spanish. Display values in USD, EUR, CHF or BRL. The app adapts to you." },
      { title: "PWA — Works Everywhere", body: "Install Wallet76 on Windows, Mac, Android and iOS as a Progressive Web App. Native-like experience on every device, with full offline support." },
      { title: "Portfolio Sharing", body: "Generate a private link to share your portfolio performance with your advisor, partner or community. Revoke access at any time." },
      { title: "Watchlist & Discovery", body: "Build watchlists to monitor assets you do not yet own. Track prices, 24h moves and market cap without adding them to your portfolio." },
      { title: "Full Transaction History", body: "Log every buy, sell, dividend and transfer with complete history. Filter, search and export your complete investment record." },
      { title: "Choice of Benchmark", body: "Compare your performance against the S&P 500, a world index, the Euro Stoxx 50 or the Nasdaq — and see returns broken down by asset class side by side." },
      { title: "Tax Report", body: "Realized gains and losses grouped by calendar year and asset, ready to export — a starting point for tax season." },
      { title: "Fee Transparency", body: "See how much you've paid in fees this year and in total, and what share that is of your current portfolio value." },
      { title: "Assets & Liquidity", body: "See at a glance how much of your portfolio you could sell this week vs. what's tied up in funds, bonds or REITs." },
    ],
    integrations_label: "Direct integrations",
    integrations_or: "or import from any broker via",
    integrations_formats: "CSV / XLSX",
    sec_title: "Security you can trust",
    sec_sub: "Your financial data is sensitive. We treat it that way — with bank-grade protection at every layer.",
    security: [
      { title: "Envelope Encryption", body: "Every broker API key and sensitive credential is encrypted (Fernet: AES-128 + HMAC authentication) with a key unique to your account before storage. Even if our database were ever compromised alone, your keys remain unreadable." },
      { title: "bcrypt Password Hashing", body: "Passwords are never stored in plain text. We use bcrypt with adaptive cost factor — the industry gold standard for password security." },
      { title: "EU-Based Infrastructure", body: "All data is stored and processed on servers within the European Union, fully subject to GDPR protections and European data sovereignty law." },
      { title: "Sync Audit Log", body: "Every broker/exchange sync is logged with timestamp, status and IP, and you're alerted by email after repeated failures — so you know if a connection may have been compromised." },
      { title: "Zero Data Selling", body: "We do not sell, rent or share your data with advertisers. Our business model is your subscription — not your information." },
      { title: "Full GDPR Compliance", body: "Right to access, right to erasure, data portability — a button in Settings generates a full copy of your data anytime. Delete your account and all data is permanently wiped within 30 days. No dark patterns, no lock-in." },
    ],
    stats: [
      { value: "11", label: "Chart time ranges" },
      { value: "6+", label: "Broker integrations" },
      { value: "6",  label: "Languages" },
      { value: "4",  label: "Currencies (USD · EUR · CHF · BRL)" },
    ],
    plan_title: "Simple, transparent pricing",
    plan_sub: "Start free. Upgrade when you are ready for the full power.",
    free_label: "Free", free_price: "€0", free_period: "forever", free_desc: "Everything you need to get started.",
    monthly_label: "Pro Monthly", monthly_price: "€6.99", monthly_period: "/ month", monthly_desc: "Full power, billed monthly.",
    annual_label: "Pro Annual", annual_price: "€4.99", annual_period: "/ month", annual_desc: "Best value — billed €59.99/year.",
    annual_save: "Save 28%",
    pro_trial: "30-day free trial · Cancel anytime",
    free_features: ["1 portfolio wallet","Up to 10 assets","Real-time price tracking","Transaction history","6 languages & 4 currencies","Basic dashboard"],
    free_limits: ["No price alerts","No broker sync","No analytics","No watchlist","No portfolio sharing"],
    pro_features: ["Unlimited wallets","Unlimited assets","Price alerts via email","6 broker & exchange integrations","Advanced analytics (CAGR, Sharpe, drawdown)","Watchlist & market movers","Deep asset research & analyst data","Portfolio sharing link","CSV / XLSX import","Market news feed","Priority support","30-day free trial"],
    btn_free: "Get started free", btn_monthly: "Start free trial", btn_annual: "Start free trial",
    cta2_title: "Take control of your financial future.",
    cta2_sub: "Join investors who track smarter with Wallet76. Free to start, powerful to grow.",
    cta2_btn: "Create your free account",
    footer_rights: "All rights reserved.",
    footer_login: "Login", footer_register: "Register", footer_pricing: "Pricing",
    footer_privacy: "Privacy Policy", footer_terms: "Terms of Service",
    most_popular: "Most Popular",
    best_value: "Best Value",
    install_title: "Install Wallet76",
    install_body: "Install the app for faster access, full-screen and an icon on your home screen — no browser tab needed.",
    install_btn: "Install app",
    install_continue: "Continue in browser",
    ios_title: "Install on iPhone/iPad",
    ios_step1: "Tap the Share icon",
    ios_step2: "Then choose \"Add to Home Screen\"",
    ios_continue: "Got it, continue",
    dl_title: "Get Wallet76 on every device",
    dl_sub: "Native apps for Windows and Android, or install as a web app anywhere else — same account, same data, everywhere.",
    dl_windows: "Windows", dl_windows_desc: "Desktop app for Windows 10 & 11. No browser tab, no distractions.",
    dl_android: "Android", dl_android_desc: "Direct APK install — Play Store coming soon.",
    dl_web: "Mac, iOS & Web", dl_web_desc: "Install Wallet76 straight from your browser as a Progressive Web App.",
    dl_btn: "Download", dl_web_btn: "Install app", dl_version: "Version",
    dl_ios_hint: "On iPhone/iPad: tap Share, then \"Add to Home Screen\".",
    family_badge: "Built for real households",
    family_title: "One login. Every wallet that matters.",
    family_sub: "Keep your own investments separate from your kids' savings or your partner's portfolio — or view everything combined in a single number. Switch between them in one tap.",
    family_wallet1: "My Retirement", family_wallet2: "Kids' Future", family_wallet3: "My Partner", family_wallet4: "Crypto Play",
    family_total_label: "Combined Total",
    family_switch_hint: "Consolidated view · switch anytime",
  },
  pt: {
    nav_features: "Funcionalidades", nav_security: "Segurança", nav_pricing: "Preços",
    nav_login: "Entrar", nav_start: "Começar grátis",
    badge: "Os seus investimentos. Um lugar. Controlo total.",
    hero1: "A forma mais inteligente", hero2: "de acompanhar o seu património.",
    hero_sub: "O Wallet76 é o gestor de carteira profissional para investidores sérios. Preços em tempo real, sincronização com brokers, análises avançadas e alertas de preço — tudo encriptado, conforme o RGPD e exclusivamente seu.",
    cta_primary: "Começar grátis — sem cartão", cta_secondary: "Ver como funciona",
    trust1: "Encriptação AES-256", trust2: "Conforme RGPD", trust3: "Servidores na UE", trust4: "Sem publicidade.",
    trust5: "Só leitura — nunca podemos mover o teu dinheiro",
    sec_badge: "Segurança de nível bancário",
    mock_balance: "Saldo Total", mock_invested: "Investido", mock_pnl: "P&L Total", mock_today: "Hoje",
    mock_top: "MELHORES ATIVOS", mock_alloc: "ALOCAÇÃO",
    mock_stocks: "Ações", mock_crypto: "Crypto", mock_etf: "ETF",
    mock_alert: "NVDA ultrapassou o alvo de $950",
    feat_title: "Tudo o que precisa para investir melhor",
    feat_sub: "Do acompanhamento em tempo real à análise profunda — o Wallet76 coloca ferramentas de nível institucional nas suas mãos.",
    features: [
      { title: "Carteira Multi-Ativo", body: "Acompanhe ações, ETFs, crypto, fundos, obrigações e dinheiro num dashboard unificado. Suporta mercados globais incluindo EUA, Europa (Euronext, LSE, Xetra) e exchanges de crypto." },
      { title: "Alertas de Preço em Tempo Real", body: "Defina alvos de preço com condições acima/abaixo e receba notificações por email assim que um ativo cruza o seu limiar. Nunca perca uma oportunidade de compra ou venda." },
      { title: "Análises Avançadas", body: "Meça o seu desempenho real com CAGR, rácio de Sharpe, drawdown máximo, volatilidade e comparação com benchmarks como S&P 500 e BTC." },
      { title: "Organização Multi-Carteira", body: "Separe os investimentos em carteiras distintas — reforma, crescimento, crypto, especulação. Alterne instantaneamente e veja vistas consolidadas ou individuais." },
      { title: "Sincronização com Brokers", body: "Ligue diretamente o DEGIRO, Interactive Brokers, Trading 212, Binance, Coinbase e Kraken. Ou importe de qualquer outro broker via CSV ou XLSX — suportamos todos os formatos de exportação principais." },
      { title: "Inteligência de Mercado", body: "Movers de mercado ao vivo, maiores subidas e descidas, e notícias financeiras personalizadas para as suas posições — tudo num feed." },
      { title: "Pesquisa de Ativos em Profundidade", body: "Clique em qualquer ativo para ver consenso de analistas, alvos de preço, métricas-chave (P/E, EPS, Beta, range 52S, yield de dividendo) e gráficos históricos." },
      { title: "6 Línguas e 4 Moedas", body: "Interface completa em inglês, português, francês, alemão, italiano e espanhol. Valores em USD, EUR, CHF ou BRL. A app adapta-se a si." },
      { title: "PWA — Funciona em Tudo", body: "Instale o Wallet76 no Windows, Mac, Android e iOS como Progressive Web App. Experiência nativa em todos os dispositivos, com suporte offline." },
      { title: "Partilha de Carteira", body: "Gere um link privado para partilhar o desempenho com o seu consultor, parceiro ou comunidade. Revogue o acesso a qualquer momento." },
      { title: "Watchlist e Descoberta", body: "Crie watchlists para monitorizar ativos que ainda não possui. Acompanhe preços e movimentos 24h sem os adicionar à carteira." },
      { title: "Histórico de Transações Completo", body: "Registe cada compra, venda, dividendo e transferência com histórico completo. Filtre, pesquise e exporte o seu registo de investimentos." },
      { title: "Benchmark à Escolha", body: "Compare o seu desempenho com o S&P 500, o índice mundial, o Euro Stoxx 50 ou o Nasdaq — e veja o retorno por classe de ativo lado a lado." },
      { title: "Relatório Fiscal", body: "Ganhos e perdas realizados agrupados por ano e por ativo, prontos a exportar — um ponto de partida para a época de impostos." },
      { title: "Transparência de Comissões", body: "Veja quanto pagou em comissões este ano e no total, e que peso isso tem no valor da sua carteira." },
      { title: "Ativos e Liquidez", body: "Veja num relance quanto da sua carteira pode vender esta semana vs. o que está em fundos, obrigações ou REITs." },
    ],
    integrations_label: "Integrações diretas",
    integrations_or: "ou importe de qualquer broker via",
    integrations_formats: "CSV / XLSX",
    sec_title: "Segurança em que pode confiar",
    sec_sub: "Os seus dados financeiros são sensíveis. Nós tratamo-los dessa forma — com proteção de nível bancário em cada camada.",
    security: [
      { title: "Encriptação por Envelope", body: "Cada chave API de broker e credencial sensível é encriptada (Fernet: AES-128 + autenticação HMAC) com uma chave única da sua conta antes do armazenamento. As suas chaves permanecem ilegíveis mesmo que só a base de dados seja comprometida." },
      { title: "Hash de Password com bcrypt", body: "As passwords nunca são armazenadas em texto simples. Usamos bcrypt com fator de custo adaptativo — o padrão de ouro da indústria." },
      { title: "Infraestrutura na UE", body: "Todos os dados são armazenados e processados em servidores na União Europeia, totalmente sujeitos às proteções RGPD." },
      { title: "Registo de Sincronizações", body: "Cada sincronização de broker/exchange é registada com timestamp, estado e IP, e recebe um alerta por email após falhas repetidas — para saber se uma ligação pode ter sido comprometida." },
      { title: "Zero Venda de Dados", body: "Não vendemos, alugamos nem partilhamos os seus dados com anunciantes. O nosso modelo de negócio é a sua subscrição — não a sua informação." },
      { title: "Conformidade Total com RGPD", body: "Direito de acesso, direito ao esquecimento, portabilidade — um botão em Definições gera uma cópia completa dos seus dados a qualquer momento. Elimine a conta e todos os dados são apagados em 30 dias. Sem padrões obscuros." },
    ],
    stats: [
      { value: "11", label: "Intervalos de gráfico" },
      { value: "6+", label: "Integrações de brokers" },
      { value: "6",  label: "Línguas" },
      { value: "4",  label: "Moedas (USD · EUR · CHF · BRL)" },
    ],
    plan_title: "Preços simples e transparentes",
    plan_sub: "Comece grátis. Faça upgrade quando estiver pronto para o poder total.",
    free_label: "Grátis", free_price: "0€", free_period: "para sempre", free_desc: "Tudo o que precisa para começar.",
    monthly_label: "Pro Mensal", monthly_price: "6,99€", monthly_period: "/ mês", monthly_desc: "Poder total, faturado mensalmente.",
    annual_label: "Pro Anual", annual_price: "4,99€", annual_period: "/ mês", annual_desc: "Melhor valor — faturado 59,99€/ano.",
    annual_save: "Poupe 28%",
    pro_trial: "30 dias de teste grátis · Cancele a qualquer momento",
    free_features: ["1 carteira","Até 10 ativos","Preços em tempo real","Histórico de transações","6 línguas e 4 moedas","Dashboard básico"],
    free_limits: ["Sem alertas de preço","Sem sincronização com brokers","Sem análises avançadas","Sem watchlist","Sem partilha de carteira"],
    pro_features: ["Carteiras ilimitadas","Ativos ilimitados","Alertas de preço por email","6 integrações de brokers/exchanges","Análises avançadas (CAGR, Sharpe, drawdown)","Watchlist e movers de mercado","Pesquisa de ativos e dados de analistas","Link de partilha de carteira","Importação CSV / XLSX","Feed de notícias financeiras","Suporte prioritário","30 dias de teste grátis"],
    btn_free: "Criar conta grátis", btn_monthly: "Iniciar teste grátis", btn_annual: "Iniciar teste grátis",
    cta2_title: "Tome o controlo do seu futuro financeiro.",
    cta2_sub: "Junte-se aos investidores que acompanham de forma mais inteligente com o Wallet76. Grátis para começar, poderoso para crescer.",
    cta2_btn: "Criar a sua conta grátis",
    footer_rights: "Todos os direitos reservados.",
    footer_login: "Entrar", footer_register: "Criar conta", footer_pricing: "Preços",
    footer_privacy: "Política de Privacidade", footer_terms: "Termos de Serviço",
    most_popular: "Mais Popular",
    best_value: "Melhor Valor",
    install_title: "Instalar o Wallet76",
    install_body: "Instale a app para acesso mais rápido, ecrã inteiro e um ícone no ecrã principal — sem precisar do browser.",
    install_btn: "Instalar app",
    install_continue: "Continuar no browser",
    ios_title: "Instalar no iPhone/iPad",
    ios_step1: "Toque no ícone Partilhar",
    ios_step2: "Depois escolha \"Adicionar ao ecrã principal\"",
    ios_continue: "Entendi, continuar",
    dl_title: "Leva o Wallet76 para todos os teus dispositivos",
    dl_sub: "Apps nativas para Windows e Android, ou instala como app web em qualquer outro sítio — a mesma conta, os mesmos dados, em todo o lado.",
    dl_windows: "Windows", dl_windows_desc: "App de secretária para Windows 10 e 11. Sem separador de browser, sem distrações.",
    dl_android: "Android", dl_android_desc: "Instalação direta do APK — Play Store brevemente.",
    dl_web: "Mac, iOS e Web", dl_web_desc: "Instala o Wallet76 diretamente do browser como Progressive Web App.",
    dl_btn: "Transferir", dl_web_btn: "Instalar app", dl_version: "Versão",
    dl_ios_hint: "No iPhone/iPad: toca em Partilhar e depois \"Adicionar ao ecrã principal\".",
    family_badge: "Feito para famílias a sério",
    family_title: "Um login. Todas as carteiras que importam.",
    family_sub: "Mantém os teus investimentos separados das poupanças dos teus filhos ou da carteira do teu companheiro/a — ou vê tudo junto num único número. Alterna entre eles num toque.",
    family_wallet1: "A Minha Reforma", family_wallet2: "Futuro dos Filhos", family_wallet3: "O Meu Companheiro/a", family_wallet4: "Cripto Especulativo",
    family_total_label: "Total Combinado",
    family_switch_hint: "Vista consolidada · alterna quando quiseres",
  },
  fr: {
    nav_features: "Fonctionnalités", nav_security: "Sécurité", nav_pricing: "Tarifs",
    nav_login: "Connexion", nav_start: "Commencer gratuitement",
    badge: "Vos investissements. Un endroit. Contrôle total.",
    hero1: "La manière la plus intelligente", hero2: "de suivre votre patrimoine.",
    hero_sub: "Wallet76 est le gestionnaire de portefeuille professionnel conçu pour les investisseurs sérieux. Prix en temps réel, synchronisation multi-courtiers, analyses avancées et alertes de prix — tout chiffré, conforme RGPD, et uniquement à vous.",
    cta_primary: "Commencer gratuitement — sans carte", cta_secondary: "Voir comment ça marche",
    trust1: "Chiffrement AES-256", trust2: "Conforme RGPD", trust3: "Serveurs UE", trust4: "Sans publicité.",
    trust5: "Lecture seule — nous ne pouvons jamais déplacer votre argent",
    sec_badge: "Sécurité de niveau bancaire",
    mock_balance: "Solde Total", mock_invested: "Investi", mock_pnl: "P&L Total", mock_today: "Aujourd'hui",
    mock_top: "MEILLEURES PERFORMANCES", mock_alloc: "ALLOCATION",
    mock_stocks: "Actions", mock_crypto: "Crypto", mock_etf: "ETF",
    mock_alert: "NVDA a dépassé l'objectif de 950 $",
    feat_title: "Tout ce qu'il vous faut pour investir mieux",
    feat_sub: "Du suivi en temps réel à l'analyse approfondie — Wallet76 met des outils de niveau institutionnel entre vos mains.",
    features: [
      { title: "Portefeuille Multi-Actifs", body: "Suivez actions, ETF, crypto, fonds, obligations et liquidités dans un tableau de bord unifié. Supporte les marchés mondiaux dont USA, Europe (Euronext, LSE, Xetra) et exchanges crypto." },
      { title: "Alertes de Prix en Temps Réel", body: "Définissez des cibles avec conditions au-dessus/en-dessous et recevez une notification par email dès qu'un actif franchit votre seuil." },
      { title: "Analyses Avancées", body: "Mesurez vos vraies performances avec CAGR, ratio de Sharpe, drawdown maximum, volatilité et comparaison avec des benchmarks comme le S&P 500 et BTC." },
      { title: "Organisation Multi-Portefeuille", body: "Séparez vos investissements en portefeuilles distincts — retraite, croissance, crypto, spéculation. Basculez instantanément entre vues consolidées ou individuelles." },
      { title: "Synchronisation Courtiers", body: "Connectez directement DEGIRO, Interactive Brokers, Trading 212, Binance, Coinbase et Kraken. Ou importez depuis tout autre courtier via CSV ou XLSX." },
      { title: "Intelligence de Marché", body: "Movers de marché en direct, meilleures hausses et baisses, et actualités financières personnalisées selon vos positions." },
      { title: "Recherche d'Actifs en Profondeur", body: "Cliquez sur un actif pour voir le consensus des analystes, les cibles de prix, les métriques clés (P/E, EPS, Bêta, plage 52S, rendement du dividende) et des graphiques interactifs." },
      { title: "6 Langues et 4 Devises", body: "Interface complète en anglais, portugais, français, allemand, italien et espagnol. Valeurs en USD, EUR, CHF ou BRL. L'application s'adapte à vous." },
      { title: "PWA — Fonctionne Partout", body: "Installez Wallet76 sur Windows, Mac, Android et iOS en tant qu'application Web progressive. Expérience native sur tous les appareils, avec support hors ligne." },
      { title: "Partage de Portefeuille", body: "Générez un lien privé pour partager vos performances avec votre conseiller, partenaire ou communauté. Révoquez l'accès à tout moment." },
      { title: "Watchlist et Découverte", body: "Créez des listes de surveillance pour suivre des actifs que vous ne possédez pas encore sans les ajouter à votre portefeuille." },
      { title: "Historique Complet des Transactions", body: "Enregistrez chaque achat, vente, dividende et transfert avec un historique complet. Filtrez, recherchez et exportez." },
      { title: "Benchmark au Choix", body: "Comparez vos performances au S&P 500, à un indice mondial, à l'Euro Stoxx 50 ou au Nasdaq — et voyez les rendements par classe d'actif côte à côte." },
      { title: "Rapport Fiscal", body: "Plus-values et moins-values réalisées regroupées par année civile et par actif, prêtes à exporter — un point de départ pour la période fiscale." },
      { title: "Transparence des Frais", body: "Voyez combien vous avez payé en frais cette année et au total, et quelle part cela représente de la valeur actuelle de votre portefeuille." },
      { title: "Actifs et Liquidité", body: "Voyez en un coup d'œil combien de votre portefeuille est vendable cette semaine vs. ce qui est immobilisé en fonds, obligations ou REIT." },
    ],
    integrations_label: "Intégrations directes",
    integrations_or: "ou importez depuis tout courtier via",
    integrations_formats: "CSV / XLSX",
    sec_title: "Une sécurité en qui vous pouvez avoir confiance",
    sec_sub: "Vos données financières sont sensibles. Nous les traitons ainsi — avec une protection de niveau bancaire à chaque couche.",
    security: [
      { title: "Chiffrement par enveloppe", body: "Chaque clé API de courtier et identifiant sensible est chiffré (Fernet : AES-128 + authentification HMAC) avec une clé unique à votre compte avant stockage. Vos clés restent illisibles même si seule la base de données est compromise." },
      { title: "Hachage de Mot de Passe bcrypt", body: "Les mots de passe ne sont jamais stockés en clair. Nous utilisons bcrypt avec facteur de coût adaptatif — la référence de l'industrie." },
      { title: "Infrastructure UE", body: "Toutes les données sont stockées et traitées sur des serveurs dans l'Union Européenne, pleinement soumis aux protections RGPD." },
      { title: "Journal des Synchronisations", body: "Chaque synchronisation courtier/exchange est enregistrée avec horodatage, statut et IP, et vous êtes alerté par email après des échecs répétés — pour savoir si une connexion a pu être compromise." },
      { title: "Zéro Vente de Données", body: "Nous ne vendons, louons ni partageons vos données avec des annonceurs. Notre modèle commercial est votre abonnement — pas vos informations." },
      { title: "Conformité RGPD Totale", body: "Droit d'accès, droit à l'effacement, portabilité — un bouton dans les Paramètres génère une copie complète de vos données à tout moment. Supprimez votre compte et toutes les données sont définitivement effacées sous 30 jours." },
    ],
    stats: [
      { value: "11", label: "Plages de graphique" },
      { value: "6+", label: "Intégrations de courtiers" },
      { value: "6",  label: "Langues" },
      { value: "4",  label: "Devises (USD · EUR · CHF · BRL)" },
    ],
    plan_title: "Tarifs simples et transparents",
    plan_sub: "Commencez gratuitement. Passez à la version complète quand vous êtes prêt.",
    free_label: "Gratuit", free_price: "0€", free_period: "pour toujours", free_desc: "Tout ce qu'il faut pour commencer.",
    monthly_label: "Pro Mensuel", monthly_price: "6,99€", monthly_period: "/ mois", monthly_desc: "Puissance totale, facturé mensuellement.",
    annual_label: "Pro Annuel", annual_price: "4,99€", annual_period: "/ mois", annual_desc: "Meilleure valeur — facturé 59,99€/an.",
    annual_save: "Économisez 28%",
    pro_trial: "30 jours d'essai gratuit · Annulez à tout moment",
    free_features: ["1 portefeuille","Jusqu'à 10 actifs","Suivi des prix en temps réel","Historique des transactions","6 langues et 4 devises","Tableau de bord de base"],
    free_limits: ["Sans alertes de prix","Sans synchro courtiers","Sans analyses avancées","Sans watchlist","Sans partage de portefeuille"],
    pro_features: ["Portefeuilles illimités","Actifs illimités","Alertes de prix par email","6 intégrations courtiers/exchanges","Analyses avancées (CAGR, Sharpe, drawdown)","Watchlist et movers de marché","Recherche d'actifs et données analystes","Lien de partage de portefeuille","Import CSV / XLSX","Fil d'actualités financières","Support prioritaire","30 jours d'essai gratuit"],
    btn_free: "Créer un compte gratuit", btn_monthly: "Démarrer l'essai gratuit", btn_annual: "Démarrer l'essai gratuit",
    cta2_title: "Prenez le contrôle de votre avenir financier.",
    cta2_sub: "Rejoignez les investisseurs qui suivent plus intelligemment avec Wallet76. Gratuit pour commencer, puissant pour grandir.",
    cta2_btn: "Créer votre compte gratuit",
    footer_rights: "Tous droits réservés.",
    footer_login: "Connexion", footer_register: "Créer un compte", footer_pricing: "Tarifs",
    footer_privacy: "Politique de confidentialité", footer_terms: "Conditions d'utilisation",
    most_popular: "Le Plus Populaire",
    best_value: "Meilleur Rapport",
    install_title: "Installer Wallet76",
    install_body: "Installez l'application pour un accès plus rapide, le plein écran et une icône sur votre écran d'accueil — sans passer par le navigateur.",
    install_btn: "Installer l'app",
    install_continue: "Continuer dans le navigateur",
    ios_title: "Installer sur iPhone/iPad",
    ios_step1: "Appuyez sur l'icône Partager",
    ios_step2: "Puis choisissez « Sur l'écran d'accueil »",
    ios_continue: "Compris, continuer",
    dl_title: "Wallet76 sur tous vos appareils",
    dl_sub: "Applications natives pour Windows et Android, ou installation en tant qu'application web ailleurs — même compte, mêmes données, partout.",
    dl_windows: "Windows", dl_windows_desc: "Application de bureau pour Windows 10 et 11. Sans onglet de navigateur, sans distraction.",
    dl_android: "Android", dl_android_desc: "Installation directe de l'APK — Play Store bientôt disponible.",
    dl_web: "Mac, iOS et Web", dl_web_desc: "Installez Wallet76 directement depuis votre navigateur en tant que Progressive Web App.",
    dl_btn: "Télécharger", dl_web_btn: "Installer l'app", dl_version: "Version",
    dl_ios_hint: "Sur iPhone/iPad : appuyez sur Partager, puis « Sur l'écran d'accueil ».",
    family_badge: "Conçu pour les vrais foyers",
    family_title: "Une connexion. Tous les portefeuilles qui comptent.",
    family_sub: "Séparez vos investissements de l'épargne de vos enfants ou du portefeuille de votre partenaire — ou voyez tout regroupé en un seul chiffre. Basculez entre eux en un instant.",
    family_wallet1: "Ma Retraite", family_wallet2: "Avenir des Enfants", family_wallet3: "Mon/Ma Partenaire", family_wallet4: "Crypto Spéculatif",
    family_total_label: "Total Combiné",
    family_switch_hint: "Vue consolidée · basculez à tout moment",
  },
  de: {
    nav_features: "Funktionen", nav_security: "Sicherheit", nav_pricing: "Preise",
    nav_login: "Anmelden", nav_start: "Kostenlos starten",
    badge: "Ihre Investments. Ein Ort. Volle Kontrolle.",
    hero1: "Der intelligentere Weg", hero2: "Ihr Vermögen zu verfolgen.",
    hero_sub: "Wallet76 ist der professionelle Portfolio-Tracker für ernsthafte Investoren. Echtzeitpreise, Multi-Broker-Synchronisierung, fortgeschrittene Analysen und Preisalarme — alles verschlüsselt, DSGVO-konform und nur für Sie.",
    cta_primary: "Kostenlos starten — keine Kreditkarte", cta_secondary: "So funktioniert es",
    trust1: "AES-256-Verschlüsselung", trust2: "DSGVO-konform", trust3: "EU-Server", trust4: "Keine Werbung.",
    trust5: "Nur Lesezugriff — wir können nie dein Geld bewegen",
    sec_badge: "Sicherheit auf Bankniveau",
    mock_balance: "Gesamtguthaben", mock_invested: "Investiert", mock_pnl: "Gesamt P&L", mock_today: "Heute",
    mock_top: "TOP-PERFORMER", mock_alloc: "AUFTEILUNG",
    mock_stocks: "Aktien", mock_crypto: "Krypto", mock_etf: "ETF",
    mock_alert: "NVDA hat das Kursziel von 950 $ überschritten",
    feat_title: "Alles, was Sie brauchen, um klüger zu investieren",
    feat_sub: "Von der Echtzeit-Verfolgung bis zur Tiefenanalyse — Wallet76 bringt institutionelle Tools in Ihre Hände.",
    features: [
      { title: "Multi-Asset-Portfolio", body: "Verfolgen Sie Aktien, ETFs, Krypto, Fonds, Anleihen und Bargeld in einem einheitlichen Dashboard. Unterstützt US-, europäische (Euronext, LSE, Xetra) und globale Kryptomärkte." },
      { title: "Echtzeit-Preisalarme", body: "Legen Sie Preisziele mit Über-/Unterkonditionen fest und erhalten Sie per E-Mail eine Benachrichtigung, sobald ein Asset Ihre Schwelle überschreitet." },
      { title: "Fortgeschrittene Analysen", body: "Messen Sie Ihre wahre Performance mit CAGR, Sharpe-Ratio, maximalem Drawdown, Volatilität und Benchmarkvergleich gegenüber S&P 500, BTC und mehr." },
      { title: "Multi-Depot-Organisation", body: "Trennen Sie Investitionen in verschiedene Portfolios — Rente, Wachstum, Krypto, Spekulation. Wechseln Sie sofort und sehen Sie konsolidierte oder individuelle Ansichten." },
      { title: "Broker- und Exchange-Synchronisierung", body: "Verbinden Sie DEGIRO, Interactive Brokers, Trading 212, Binance, Coinbase und Kraken direkt. Oder importieren Sie von jedem anderen Broker per CSV oder XLSX." },
      { title: "Marktintelligenz", body: "Live-Marktbewegungen, Top-Gewinner und -Verlierer sowie personalisierte Finanznachrichten für Ihre Positionen — alles in einem Feed." },
      { title: "Tiefe Asset-Recherche", body: "Klicken Sie auf ein Asset für Analystenempfehlungen, Kursziele, Kennzahlen (KGV, EPS, Beta, 52-Wochen-Spanne, Dividendenrendite) und interaktive Charts." },
      { title: "6 Sprachen und 4 Währungen", body: "Vollständige Oberfläche auf Englisch, Portugiesisch, Französisch, Deutsch, Italienisch und Spanisch. Werte in USD, EUR, CHF oder BRL. Die App passt sich Ihnen an." },
      { title: "PWA — Überall verfügbar", body: "Installieren Sie Wallet76 auf Windows, Mac, Android und iOS als Progressive Web App. Native Erfahrung auf jedem Gerät, mit Offline-Unterstützung." },
      { title: "Portfolio-Freigabe", body: "Erstellen Sie einen privaten Link zum Teilen Ihrer Portfolio-Performance mit Ihrem Berater, Partner oder Ihrer Community. Widerrufen Sie den Zugriff jederzeit." },
      { title: "Watchlist und Entdeckung", body: "Erstellen Sie Watchlists für Assets, die Sie noch nicht besitzen. Verfolgen Sie Preise und 24h-Bewegungen ohne sie Ihrem Portfolio hinzuzufügen." },
      { title: "Vollständige Transaktionshistorie", body: "Erfassen Sie jeden Kauf, Verkauf, Dividende und Transfer mit vollständiger Historie. Filtern, suchen und exportieren Sie." },
      { title: "Benchmark nach Wahl", body: "Vergleichen Sie Ihre Performance mit S&P 500, MSCI World, Euro Stoxx 50 oder Nasdaq 100 — wählen Sie den Maßstab, der zu Ihrer Strategie passt." },
      { title: "Steuerbericht", body: "Realisierte Gewinne und Verluste automatisch nach Jahr und Anlageklasse gruppiert — bereit für Ihre Steuererklärung." },
      { title: "Gebührentransparenz", body: "Sehen Sie, wie viel Sie dieses Jahr und insgesamt an Gebühren gezahlt haben, und welchen Anteil das an Ihrem Portfolio ausmacht." },
      { title: "Vermögen und Liquidität", body: "Sehen Sie auf einen Blick, welcher Teil Ihres Vermögens sofort verfügbar ist und welcher Teil weniger liquide ist." },
    ],
    integrations_label: "Direkte Integrationen",
    integrations_or: "oder von jedem Broker importieren via",
    integrations_formats: "CSV / XLSX",
    sec_title: "Sicherheit, der Sie vertrauen können",
    sec_sub: "Ihre Finanzdaten sind sensibel. Wir behandeln sie so — mit bankähnlichem Schutz auf jeder Ebene.",
    security: [
      { title: "Umschlagverschlüsselung", body: "Jeder Broker-API-Schlüssel wird vor der Speicherung mit einem für Ihr Konto einzigartigen Schlüssel verschlüsselt (Fernet: AES-128 + HMAC-Authentifizierung). Selbst bei einem reinen Datenbankleck bleiben Ihre Schlüssel unlesbar." },
      { title: "bcrypt-Passwort-Hashing", body: "Passwörter werden niemals im Klartext gespeichert. Wir verwenden bcrypt mit adaptivem Kostenfaktor — der Industriestandard für Passwortsicherheit." },
      { title: "EU-Infrastruktur", body: "Alle Daten werden auf Servern innerhalb der Europäischen Union gespeichert und verarbeitet, vollständig den DSGVO-Schutzbestimmungen unterworfen." },
      { title: "Sync-Protokoll", body: "Jede Broker-/Exchange-Synchronisierung wird mit Zeitstempel, Status und IP protokolliert, und Sie werden nach wiederholten Fehlversuchen per E-Mail benachrichtigt — so wissen Sie, ob eine Verbindung kompromittiert sein könnte." },
      { title: "Keine Datenweitergabe", body: "Wir verkaufen, vermieten oder teilen Ihre Daten nicht mit Werbetreibenden. Unser Geschäftsmodell ist Ihr Abonnement — nicht Ihre Daten." },
      { title: "Volle DSGVO-Konformität", body: "Auskunftsrecht, Recht auf Löschung, Datenübertragbarkeit — ein Button in den Einstellungen erstellt jederzeit eine vollständige Kopie Ihrer Daten. Konto löschen und alle Daten werden innerhalb von 30 Tagen dauerhaft gelöscht." },
    ],
    stats: [
      { value: "11", label: "Chart-Zeitrahmen" },
      { value: "6+", label: "Broker-Integrationen" },
      { value: "6",  label: "Sprachen" },
      { value: "4",  label: "Währungen (USD · EUR · CHF · BRL)" },
    ],
    plan_title: "Einfache, transparente Preise",
    plan_sub: "Kostenlos starten. Upgraden Sie, wenn Sie bereit sind.",
    free_label: "Kostenlos", free_price: "0€", free_period: "für immer", free_desc: "Alles, was Sie für den Einstieg brauchen.",
    monthly_label: "Pro Monatlich", monthly_price: "6,99€", monthly_period: "/ Monat", monthly_desc: "Volle Leistung, monatlich abgerechnet.",
    annual_label: "Pro Jährlich", annual_price: "4,99€", annual_period: "/ Monat", annual_desc: "Bestes Preis-Leistungs-Verhältnis — 59,99€/Jahr.",
    annual_save: "28% sparen",
    pro_trial: "30 Tage kostenlose Testversion · Jederzeit kündigen",
    free_features: ["1 Portfolio-Depot","Bis zu 10 Assets","Echtzeit-Preisverfolgung","Transaktionshistorie","6 Sprachen und 4 Währungen","Basis-Dashboard"],
    free_limits: ["Keine Preisalarme","Keine Broker-Synchronisierung","Keine Analysen","Keine Watchlist","Keine Portfolio-Freigabe"],
    pro_features: ["Unbegrenzte Depots","Unbegrenzte Assets","Preisalarme per E-Mail","6 Broker/Exchange-Integrationen","Fortgeschrittene Analysen (CAGR, Sharpe, Drawdown)","Watchlist und Marktbewegungen","Asset-Recherche und Analystendaten","Portfolio-Freigabelink","CSV/XLSX-Import","Finanznachrichten-Feed","Prioritäts-Support","30 Tage kostenlose Testversion"],
    btn_free: "Kostenlos starten", btn_monthly: "Testversion starten", btn_annual: "Testversion starten",
    cta2_title: "Übernehmen Sie die Kontrolle über Ihre finanzielle Zukunft.",
    cta2_sub: "Schließen Sie sich Investoren an, die mit Wallet76 intelligenter verfolgen. Kostenlos zum Starten, leistungsstark zum Wachsen.",
    cta2_btn: "Kostenloses Konto erstellen",
    footer_rights: "Alle Rechte vorbehalten.",
    footer_login: "Anmelden", footer_register: "Konto erstellen", footer_pricing: "Preise",
    footer_privacy: "Datenschutzerklärung", footer_terms: "Nutzungsbedingungen",
    most_popular: "Beliebteste",
    best_value: "Bestes Angebot",
    install_title: "Wallet76 installieren",
    install_body: "Installieren Sie die App für schnelleren Zugriff, Vollbild und ein Symbol auf Ihrem Startbildschirm — ganz ohne Browser.",
    install_btn: "App installieren",
    install_continue: "Im Browser fortfahren",
    ios_title: "Auf iPhone/iPad installieren",
    ios_step1: "Tippen Sie auf das Teilen-Symbol",
    ios_step2: "Wählen Sie dann \"Zum Home-Bildschirm\"",
    ios_continue: "Verstanden, weiter",
    dl_title: "Wallet76 auf all deinen Geräten",
    dl_sub: "Native Apps für Windows und Android, oder installiere es überall sonst als Web-App — derselbe Account, dieselben Daten, überall.",
    dl_windows: "Windows", dl_windows_desc: "Desktop-App für Windows 10 und 11. Ohne Browser-Tab, ohne Ablenkung.",
    dl_android: "Android", dl_android_desc: "Direkte APK-Installation — Play Store folgt bald.",
    dl_web: "Mac, iOS & Web", dl_web_desc: "Installiere Wallet76 direkt aus deinem Browser als Progressive Web App.",
    dl_btn: "Herunterladen", dl_web_btn: "App installieren", dl_version: "Version",
    dl_ios_hint: "Auf iPhone/iPad: Tippe auf Teilen, dann \"Zum Home-Bildschirm\".",
    family_badge: "Für echte Haushalte gemacht",
    family_title: "Ein Login. Jedes Depot, das zählt.",
    family_sub: "Halte deine eigenen Investitionen getrennt von den Ersparnissen deiner Kinder oder dem Portfolio deines Partners — oder sieh alles zusammengefasst in einer einzigen Zahl. Wechsle jederzeit mit einem Klick.",
    family_wallet1: "Meine Rente", family_wallet2: "Zukunft der Kinder", family_wallet3: "Mein Partner", family_wallet4: "Krypto-Spekulation",
    family_total_label: "Gesamtsumme",
    family_switch_hint: "Konsolidierte Ansicht · jederzeit wechselbar",
  },
  it: {
    nav_features: "Funzionalità", nav_security: "Sicurezza", nav_pricing: "Prezzi",
    nav_login: "Accedi", nav_start: "Inizia gratis",
    badge: "I tuoi investimenti. Un posto. Controllo totale.",
    hero1: "Il modo più intelligente", hero2: "di monitorare il tuo patrimonio.",
    hero_sub: "Wallet76 è il tracker di portafoglio professionale costruito per investitori seri. Prezzi in tempo reale, sincronizzazione multi-broker, analisi avanzate e alert di prezzo — tutto crittografato, conforme GDPR e solo tuo.",
    cta_primary: "Inizia gratis — senza carta", cta_secondary: "Scopri come funziona",
    trust1: "Crittografia AES-256", trust2: "Conforme GDPR", trust3: "Server UE", trust4: "Senza pubblicità.",
    trust5: "Solo lettura — non possiamo mai muovere i tuoi soldi",
    sec_badge: "Sicurezza di livello bancario",
    mock_balance: "Saldo Totale", mock_invested: "Investito", mock_pnl: "P&L Totale", mock_today: "Oggi",
    mock_top: "TOP PERFORMER", mock_alloc: "ALLOCAZIONE",
    mock_stocks: "Azioni", mock_crypto: "Crypto", mock_etf: "ETF",
    mock_alert: "NVDA ha superato l'obiettivo di $950",
    feat_title: "Tutto ciò di cui hai bisogno per investire meglio",
    feat_sub: "Dal monitoraggio in tempo reale all'analisi approfondita — Wallet76 mette strumenti di livello istituzionale nelle tue mani.",
    features: [
      { title: "Portafoglio Multi-Asset", body: "Monitora azioni, ETF, crypto, fondi, obbligazioni e liquidità in un unico dashboard unificato. Supporta mercati globali inclusi USA, Europa (Euronext, LSE, Xetra) e exchange crypto." },
      { title: "Alert di Prezzo in Tempo Reale", body: "Imposta target di prezzo con condizioni sopra/sotto e ricevi notifiche via email nel momento in cui un asset supera la tua soglia." },
      { title: "Analisi Avanzate", body: "Misura le tue vere performance con CAGR, indice di Sharpe, drawdown massimo, volatilità e confronto con benchmark come S&P 500 e BTC." },
      { title: "Organizzazione Multi-Portafoglio", body: "Separa gli investimenti in portafogli distinti — pensione, crescita, crypto, speculazione. Passa istantaneamente tra viste consolidate o individuali." },
      { title: "Sincronizzazione Broker ed Exchange", body: "Connetti direttamente DEGIRO, Interactive Brokers, Trading 212, Binance, Coinbase e Kraken. O importa da qualsiasi altro broker tramite CSV o XLSX." },
      { title: "Intelligence di Mercato", body: "Movers di mercato in tempo reale, migliori rialzi e ribassi e notizie finanziarie personalizzate per le tue posizioni — tutto in un feed." },
      { title: "Ricerca Approfondita degli Asset", body: "Clicca su qualsiasi asset per vedere il consenso degli analisti, i target di prezzo, le metriche chiave (P/E, EPS, Beta, range 52S, rendimento dividendo) e grafici interattivi." },
      { title: "6 Lingue e 4 Valute", body: "Interfaccia completa in inglese, portoghese, francese, tedesco, italiano e spagnolo. Valori in USD, EUR, CHF o BRL. L'app si adatta a te." },
      { title: "PWA — Funziona Ovunque", body: "Installa Wallet76 su Windows, Mac, Android e iOS come Progressive Web App. Esperienza nativa su ogni dispositivo, con supporto offline." },
      { title: "Condivisione del Portafoglio", body: "Genera un link privato per condividere le performance del tuo portafoglio con il tuo consulente, partner o community. Revoca l'accesso in qualsiasi momento." },
      { title: "Watchlist e Scoperta", body: "Crea watchlist per monitorare asset che non possiedi ancora. Segui prezzi e movimenti 24h senza aggiungerli al portafoglio." },
      { title: "Storico Completo delle Transazioni", body: "Registra ogni acquisto, vendita, dividendo e trasferimento con storico completo. Filtra, cerca ed esporta." },
      { title: "Benchmark a Scelta", body: "Confronta le tue performance con S&P 500, MSCI World, Euro Stoxx 50 o Nasdaq 100 — scegli il parametro più adatto alla tua strategia." },
      { title: "Rapporto Fiscale", body: "Plusvalenze e minusvalenze realizzate raggruppate automaticamente per anno e classe di asset — pronte per la tua dichiarazione dei redditi." },
      { title: "Trasparenza delle Commissioni", body: "Vedi quanto hai pagato in commissioni quest'anno e in totale, e quale percentuale rappresentano sul tuo portafoglio." },
      { title: "Asset e Liquidità", body: "Vedi a colpo d'occhio quale parte del tuo patrimonio è immediatamente disponibile e quale parte è meno liquida." },
    ],
    integrations_label: "Integrazioni dirette",
    integrations_or: "o importa da qualsiasi broker tramite",
    integrations_formats: "CSV / XLSX",
    sec_title: "Sicurezza di cui puoi fidarti",
    sec_sub: "I tuoi dati finanziari sono sensibili. Li trattiamo come tali — con protezione di livello bancario ad ogni strato.",
    security: [
      { title: "Crittografia a Busta", body: "Ogni chiave API broker e credenziale sensibile è crittografata (Fernet: AES-128 + autenticazione HMAC) con una chiave unica del tuo account prima dell'archiviazione. Le tue chiavi restano illeggibili anche se solo il database viene compromesso." },
      { title: "Hashing Password bcrypt", body: "Le password non vengono mai archiviate in chiaro. Usiamo bcrypt con fattore di costo adattivo — lo standard d'oro del settore." },
      { title: "Infrastruttura UE", body: "Tutti i dati sono archiviati ed elaborati su server nell'Unione Europea, pienamente soggetti alle protezioni GDPR." },
      { title: "Log delle Sincronizzazioni", body: "Ogni sincronizzazione broker/exchange è registrata con timestamp, stato e IP, e ricevi un avviso via email dopo errori ripetuti — per sapere se una connessione potrebbe essere compromessa." },
      { title: "Zero Vendita di Dati", body: "Non vendiamo, affittiamo né condividiamo i tuoi dati con inserzionisti. Il nostro modello di business è il tuo abbonamento — non le tue informazioni." },
      { title: "Piena Conformità GDPR", body: "Diritto di accesso, diritto alla cancellazione, portabilità dei dati — un pulsante nelle Impostazioni genera una copia completa dei tuoi dati in qualsiasi momento. Elimina l'account e tutti i dati vengono cancellati definitivamente entro 30 giorni." },
    ],
    stats: [
      { value: "11", label: "Intervalli di grafico" },
      { value: "6+", label: "Integrazioni broker" },
      { value: "6",  label: "Lingue" },
      { value: "4",  label: "Valute (USD · EUR · CHF · BRL)" },
    ],
    plan_title: "Prezzi semplici e trasparenti",
    plan_sub: "Inizia gratis. Aggiorna quando sei pronto per la piena potenza.",
    free_label: "Gratuito", free_price: "0€", free_period: "per sempre", free_desc: "Tutto ciò che ti serve per iniziare.",
    monthly_label: "Pro Mensile", monthly_price: "6,99€", monthly_period: "/ mese", monthly_desc: "Piena potenza, fatturato mensilmente.",
    annual_label: "Pro Annuale", annual_price: "4,99€", annual_period: "/ mese", annual_desc: "Miglior valore — fatturato 59,99€/anno.",
    annual_save: "Risparmia 28%",
    pro_trial: "30 giorni di prova gratuita · Cancella in qualsiasi momento",
    free_features: ["1 portafoglio","Fino a 10 asset","Tracciamento prezzi in tempo reale","Storico transazioni","6 lingue e 4 valute","Dashboard di base"],
    free_limits: ["Nessun alert di prezzo","Nessuna sincronizzazione broker","Nessuna analisi avanzata","Nessuna watchlist","Nessuna condivisione portafoglio"],
    pro_features: ["Portafogli illimitati","Asset illimitati","Alert di prezzo via email","6 integrazioni broker/exchange","Analisi avanzate (CAGR, Sharpe, drawdown)","Watchlist e movers di mercato","Ricerca asset e dati analisti","Link di condivisione portafoglio","Import CSV / XLSX","Feed notizie finanziarie","Supporto prioritario","30 giorni di prova gratuita"],
    btn_free: "Crea account gratuito", btn_monthly: "Inizia la prova gratuita", btn_annual: "Inizia la prova gratuita",
    cta2_title: "Prendi il controllo del tuo futuro finanziario.",
    cta2_sub: "Unisciti agli investitori che monitorano in modo più intelligente con Wallet76. Gratis per iniziare, potente per crescere.",
    cta2_btn: "Crea il tuo account gratuito",
    footer_rights: "Tutti i diritti riservati.",
    footer_login: "Accedi", footer_register: "Crea account", footer_pricing: "Prezzi",
    footer_privacy: "Informativa sulla Privacy", footer_terms: "Termini di Servizio",
    most_popular: "Più Popolare",
    best_value: "Miglior Valore",
    install_title: "Installa Wallet76",
    install_body: "Installa l'app per un accesso più rapido, schermo intero e un'icona nella schermata Home — senza bisogno del browser.",
    install_btn: "Installa app",
    install_continue: "Continua nel browser",
    ios_title: "Installa su iPhone/iPad",
    ios_step1: "Tocca l'icona Condividi",
    ios_step2: "Poi scegli \"Aggiungi a Home\"",
    ios_continue: "Capito, continua",
    dl_title: "Wallet76 su tutti i tuoi dispositivi",
    dl_sub: "App native per Windows e Android, oppure installala come app web ovunque altro — stesso account, stessi dati, ovunque.",
    dl_windows: "Windows", dl_windows_desc: "App desktop per Windows 10 e 11. Niente scheda del browser, niente distrazioni.",
    dl_android: "Android", dl_android_desc: "Installazione diretta dell'APK — Play Store in arrivo.",
    dl_web: "Mac, iOS e Web", dl_web_desc: "Installa Wallet76 direttamente dal browser come Progressive Web App.",
    dl_btn: "Scarica", dl_web_btn: "Installa app", dl_version: "Versione",
    dl_ios_hint: "Su iPhone/iPad: tocca Condividi, poi \"Aggiungi a Home\".",
    family_badge: "Pensato per le famiglie vere",
    family_title: "Un accesso. Ogni portafoglio che conta.",
    family_sub: "Tieni i tuoi investimenti separati dai risparmi dei tuoi figli o dal portafoglio del tuo partner — oppure vedi tutto insieme in un unico numero. Passa da uno all'altro in un tocco.",
    family_wallet1: "La Mia Pensione", family_wallet2: "Futuro dei Figli", family_wallet3: "Il Mio Partner", family_wallet4: "Crypto Speculativo",
    family_total_label: "Totale Combinato",
    family_switch_hint: "Vista consolidata · cambia quando vuoi",
  },
  es: {
    nav_features: "Funcionalidades", nav_security: "Seguridad", nav_pricing: "Precios",
    nav_login: "Iniciar sesión", nav_start: "Empezar gratis",
    badge: "Tus inversiones. Un lugar. Control total.",
    hero1: "La forma más inteligente", hero2: "de seguir tu patrimonio.",
    hero_sub: "Wallet76 es el gestor de portafolio profesional para inversores serios. Precios en tiempo real, sincronización multi-broker, análisis avanzados y alertas de precio — todo cifrado, conforme al RGPD y solo tuyo.",
    cta_primary: "Empezar gratis — sin tarjeta", cta_secondary: "Ver cómo funciona",
    trust1: "Cifrado AES-256", trust2: "Conforme RGPD", trust3: "Servidores UE", trust4: "Sin publicidad.",
    trust5: "Solo lectura — nunca podemos mover tu dinero",
    sec_badge: "Seguridad de nivel bancario",
    mock_balance: "Saldo Total", mock_invested: "Invertido", mock_pnl: "P&L Total", mock_today: "Hoy",
    mock_top: "MEJORES ACTIVOS", mock_alloc: "ASIGNACIÓN",
    mock_stocks: "Acciones", mock_crypto: "Cripto", mock_etf: "ETF",
    mock_alert: "NVDA superó el objetivo de $950",
    feat_title: "Todo lo que necesitas para invertir mejor",
    feat_sub: "Del seguimiento en tiempo real al análisis profundo — Wallet76 pone herramientas de nivel institucional en tus manos.",
    features: [
      { title: "Portafolio Multi-Activo", body: "Sigue acciones, ETFs, cripto, fondos, bonos y efectivo en un único dashboard unificado. Compatible con mercados globales incluyendo EE.UU., Europa (Euronext, LSE, Xetra) y exchanges cripto." },
      { title: "Alertas de Precio en Tiempo Real", body: "Define objetivos de precio con condiciones por encima/por debajo y recibe notificaciones por email en cuanto un activo cruza tu umbral. Nunca pierdas una oportunidad de compra o venta." },
      { title: "Análisis Avanzados", body: "Mide tu rendimiento real con CAGR, ratio de Sharpe, drawdown máximo, volatilidad y comparación con benchmarks como el S&P 500 y BTC." },
      { title: "Organización Multi-Cartera", body: "Separa tus inversiones en carteras distintas — pensión, crecimiento, cripto, especulación. Cambia al instante y ve vistas consolidadas o individuales." },
      { title: "Sincronización con Brokers", body: "Conecta directamente DEGIRO, Interactive Brokers, Trading 212, Binance, Coinbase y Kraken. O importa desde cualquier otro broker mediante CSV o XLSX — soportamos todos los formatos de exportación principales." },
      { title: "Inteligencia de Mercado", body: "Movers de mercado en tiempo real, mayores subidas y bajadas, y noticias financieras personalizadas para tus posiciones — todo en un feed." },
      { title: "Investigación Profunda de Activos", body: "Haz clic en cualquier activo para ver el consenso de analistas, precios objetivo, métricas clave (P/E, EPS, Beta, rango 52S, rendimiento de dividendo) y gráficos interactivos." },
      { title: "6 Idiomas y 4 Divisas", body: "Interfaz completa en inglés, portugués, francés, alemán, italiano y español. Valores en USD, EUR, CHF o BRL. La app se adapta a ti." },
      { title: "PWA — Funciona en Todas Partes", body: "Instala Wallet76 en Windows, Mac, Android e iOS como Progressive Web App. Experiencia nativa en cada dispositivo, con soporte offline." },
      { title: "Compartir Portafolio", body: "Genera un enlace privado para compartir el rendimiento de tu portafolio con tu asesor, socio o comunidad. Revoca el acceso en cualquier momento." },
      { title: "Watchlist y Descubrimiento", body: "Crea listas de seguimiento para monitorizar activos que aún no posees. Sigue precios y movimientos 24h sin añadirlos a tu portafolio." },
      { title: "Historial Completo de Transacciones", body: "Registra cada compra, venta, dividendo y transferencia con historial completo. Filtra, busca y exporta tu registro de inversiones." },
      { title: "Benchmark a Elegir", body: "Compara tu rendimiento con el S&P 500, MSCI World, Euro Stoxx 50 o Nasdaq 100 — elige el referente que se ajuste a tu estrategia." },
      { title: "Informe Fiscal", body: "Ganancias y pérdidas realizadas agrupadas automáticamente por año y clase de activo — listas para tu declaración de la renta." },
      { title: "Transparencia de Comisiones", body: "Ve cuánto has pagado en comisiones este año y en total, y qué porcentaje representan sobre tu cartera." },
      { title: "Activos y Liquidez", body: "Ve de un vistazo qué parte de tu patrimonio está disponible de inmediato y qué parte es menos líquida." },
    ],
    integrations_label: "Integraciones directas",
    integrations_or: "o importa desde cualquier broker via",
    integrations_formats: "CSV / XLSX",
    sec_title: "Seguridad en la que puedes confiar",
    sec_sub: "Tus datos financieros son sensibles. Los tratamos como tales — con protección de nivel bancario en cada capa.",
    security: [
      { title: "Cifrado por Sobre", body: "Cada clave API de broker y credencial sensible se cifra (Fernet: AES-128 + autenticación HMAC) con una clave única de tu cuenta antes del almacenamiento. Tus claves permanecen ilegibles incluso si solo la base de datos se ve comprometida." },
      { title: "Hash de Contraseña bcrypt", body: "Las contraseñas nunca se almacenan en texto plano. Usamos bcrypt con factor de coste adaptativo — el estándar de oro del sector." },
      { title: "Infraestructura UE", body: "Todos los datos se almacenan y procesan en servidores dentro de la Unión Europea, plenamente sujetos a las protecciones del RGPD." },
      { title: "Registro de Sincronizaciones", body: "Cada sincronización de broker/exchange se registra con marca de tiempo, estado e IP, y recibes una alerta por email tras fallos repetidos — para saber si una conexión pudo verse comprometida." },
      { title: "Cero Venta de Datos", body: "No vendemos, alquilamos ni compartimos tus datos con anunciantes. Nuestro modelo de negocio es tu suscripción — no tu información." },
      { title: "Plena Conformidad RGPD", body: "Derecho de acceso, derecho al olvido, portabilidad — un botón en Ajustes genera una copia completa de tus datos en cualquier momento. Elimina la cuenta y todos los datos se borran permanentemente en 30 días." },
    ],
    stats: [
      { value: "11", label: "Intervalos de gráfico" },
      { value: "6+", label: "Integraciones de brokers" },
      { value: "6",  label: "Idiomas" },
      { value: "4",  label: "Divisas (USD · EUR · CHF · BRL)" },
    ],
    plan_title: "Precios simples y transparentes",
    plan_sub: "Empieza gratis. Actualiza cuando estés listo para el poder completo.",
    free_label: "Gratuito", free_price: "0€", free_period: "para siempre", free_desc: "Todo lo que necesitas para empezar.",
    monthly_label: "Pro Mensual", monthly_price: "6,99€", monthly_period: "/ mes", monthly_desc: "Potencia total, facturado mensualmente.",
    annual_label: "Pro Anual", annual_price: "4,99€", annual_period: "/ mes", annual_desc: "Mejor valor — facturado 59,99€/año.",
    annual_save: "Ahorra 28%",
    pro_trial: "30 días de prueba gratuita · Cancela cuando quieras",
    free_features: ["1 cartera","Hasta 10 activos","Seguimiento de precios en tiempo real","Historial de transacciones","6 idiomas y 4 divisas","Dashboard básico"],
    free_limits: ["Sin alertas de precio","Sin sincronización con brokers","Sin análisis avanzados","Sin watchlist","Sin compartir portafolio"],
    pro_features: ["Carteras ilimitadas","Activos ilimitados","Alertas de precio por email","6 integraciones brokers/exchanges","Análisis avanzados (CAGR, Sharpe, drawdown)","Watchlist y movers de mercado","Investigación de activos y datos de analistas","Enlace de compartir portafolio","Importación CSV / XLSX","Feed de noticias financieras","Soporte prioritario","30 días de prueba gratuita"],
    btn_free: "Crear cuenta gratis", btn_monthly: "Iniciar prueba gratuita", btn_annual: "Iniciar prueba gratuita",
    cta2_title: "Toma el control de tu futuro financiero.",
    cta2_sub: "Únete a los inversores que siguen de forma más inteligente con Wallet76. Gratis para empezar, potente para crecer.",
    cta2_btn: "Crear tu cuenta gratis",
    footer_rights: "Todos los derechos reservados.",
    footer_login: "Iniciar sesión", footer_register: "Crear cuenta", footer_pricing: "Precios",
    footer_privacy: "Política de Privacidad", footer_terms: "Términos de Servicio",
    most_popular: "Más Popular",
    best_value: "Mejor Valor",
    install_title: "Instalar Wallet76",
    install_body: "Instala la app para acceso más rápido, pantalla completa e icono en tu pantalla de inicio — sin necesidad del navegador.",
    install_btn: "Instalar app",
    install_continue: "Continuar en el navegador",
    ios_title: "Instalar en iPhone/iPad",
    ios_step1: "Toca el icono Compartir",
    ios_step2: "Luego elige \"Añadir a pantalla de inicio\"",
    ios_continue: "Entendido, continuar",
    dl_title: "Wallet76 en todos tus dispositivos",
    dl_sub: "Apps nativas para Windows y Android, o instálala como app web en cualquier otro sitio — la misma cuenta, los mismos datos, en todas partes.",
    dl_windows: "Windows", dl_windows_desc: "App de escritorio para Windows 10 y 11. Sin pestaña del navegador, sin distracciones.",
    dl_android: "Android", dl_android_desc: "Instalación directa del APK — Play Store próximamente.",
    dl_web: "Mac, iOS y Web", dl_web_desc: "Instala Wallet76 directamente desde tu navegador como Progressive Web App.",
    dl_btn: "Descargar", dl_web_btn: "Instalar app", dl_version: "Versión",
    dl_ios_hint: "En iPhone/iPad: toca Compartir y luego \"Añadir a pantalla de inicio\".",
    family_badge: "Hecho para familias de verdad",
    family_title: "Un inicio de sesión. Cada cartera que importa.",
    family_sub: "Mantén tus inversiones separadas de los ahorros de tus hijos o de la cartera de tu pareja — o ve todo junto en un único número. Cambia entre ellas al instante.",
    family_wallet1: "Mi Jubilación", family_wallet2: "Futuro de los Hijos", family_wallet3: "Mi Pareja", family_wallet4: "Cripto Especulativo",
    family_total_label: "Total Combinado",
    family_switch_hint: "Vista consolidada · cambia cuando quieras",
  },
};

function getCopy(lang) { return COPY[lang] || COPY.en; }

const FEAT_ICONS = [PieChart, Bell, Activity, Wallet, RefreshCw, Newspaper, BarChart3, Globe2, MonitorSmartphone, Users, Star, FileText];
const FEAT_COLORS = [
  "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "text-rose-400 bg-rose-500/10 border-rose-500/20",
  "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  "text-teal-400 bg-teal-500/10 border-teal-500/20",
  "text-violet-400 bg-violet-500/10 border-violet-500/20",
  "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "text-pink-400 bg-pink-500/10 border-pink-500/20",
  "text-lime-400 bg-lime-500/10 border-lime-500/20",
];
const SEC_ICONS = [Lock, ShieldCheck, Server, FileText, X, Check];

function MockDashboard({ c }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl shadow-blue-500/10 w-full">
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
        <div className="border-b border-zinc-800/60 px-4 py-3 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-mono text-zinc-400 tracking-widest uppercase">Wallet76</span>
          </div>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
          {[
            { label: c.mock_balance, value: "$48,240", change: "+12.4%", up: true },
            { label: c.mock_invested, value: "$42,800", change: null },
            { label: c.mock_pnl, value: "+$5,440", change: "+12.71%", up: true },
            { label: c.mock_today, value: "+$384", change: "+0.80%", up: true },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-zinc-800/50 bg-zinc-900/50 p-3">
              <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">{s.label}</div>
              <div className="text-lg font-mono font-bold text-zinc-100">{s.value}</div>
              {s.change && <div className={`text-[11px] font-mono mt-0.5 ${s.up ? "text-emerald-400" : "text-red-400"}`}>{s.change}</div>}
            </div>
          ))}
        </div>
        <div className="px-4 pb-2">
          <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 h-24 overflow-hidden">
            <svg viewBox="0 0 400 60" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 55 L40 45 L80 40 L120 32 L160 38 L200 25 L240 20 L280 12 L320 8 L360 4 L400 2 L400 60 L0 60 Z" fill="url(#gfill)" />
              <path d="M0 55 L40 45 L80 40 L120 32 L160 38 L200 25 L240 20 L280 12 L320 8 L360 4 L400 2" fill="none" stroke="#10b981" strokeWidth="1.5" />
            </svg>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 pt-2">
          <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 mb-3">{c.mock_top}</div>
            <div className="space-y-2">
              {[
                { sym: "NVDA", name: "NVIDIA",  val: "$18,420", pct: "+182%" },
                { sym: "BTC",  name: "Bitcoin", val: "$12,800", pct: "+64%"  },
                { sym: "AAPL", name: "Apple",   val: "$9,100",  pct: "+28%"  },
              ].map((a) => (
                <div key={a.sym} className="flex items-center justify-between bg-black/30 border border-zinc-800/40 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[9px] font-mono text-zinc-300">{a.sym[0]}</div>
                    <div><div className="text-xs font-mono text-zinc-200">{a.sym}</div><div className="text-[10px] text-zinc-500">{a.name}</div></div>
                  </div>
                  <div className="text-right"><div className="text-xs font-mono text-zinc-200">{a.val}</div><div className="text-[10px] text-emerald-400">{a.pct}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-blue-400 mb-3">{c.mock_alloc}</div>
            <div className="space-y-2.5">
              {[
                { label: c.mock_stocks, pct: 52, color: "bg-blue-500" },
                { label: c.mock_crypto, pct: 30, color: "bg-amber-500" },
                { label: c.mock_etf,    pct: 18, color: "bg-purple-500" },
              ].map((b) => (
                <div key={b.label}>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1"><span>{b.label}</span><span>{b.pct}%</span></div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full ${b.color} rounded-full`} style={{ width: `${b.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 border border-amber-500/20 bg-amber-500/5 rounded-lg px-3 py-2 flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[10px] text-amber-300 font-mono">{c.mock_alert}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { lang, setLang } = useI18n();
  const c = getCopy(lang);
  const langs = LANGS_LIST[lang] || LANGS_LIST.en;
  const navigate = useNavigate();

  const platform = useMemo(() => detectPlatform(), []);
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  const [installTarget, setInstallTarget] = useState(null); // null | "/login" | "/register"

  // Versões reais para a secção de Downloads (10 jul 2026) — os mesmos
  // ficheiros estáticos já usados pelo ApkUpdateBanner.jsx (Android) e pelo
  // novo workflow windows-build.yml (Windows), servidos pelo próprio
  // domínio. cache: "no-store" para nunca mostrar uma versão desatualizada
  // por causa de cache do browser/CDN.
  const [androidInfo, setAndroidInfo] = useState(null);
  const [desktopInfo, setDesktopInfo] = useState(null);
  useEffect(() => {
    fetch("/app-version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setAndroidInfo).catch(() => {});
    fetch("/desktop-version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setDesktopInfo).catch(() => {});
  }, []);

  // beforeinstallprompt (Android/Desktop) pode chegar depois deste
  // componente já ter montado — subscreve para saber assim que ficar
  // disponível, sem precisar de recarregar a página.
  useEffect(() => subscribeInstallState(() => setCanPrompt(canPromptInstall())), []);

  // "Quando tentarem entrar" (6 jul 2026): em vez de um banner permanente,
  // intercetamos o clique nos botões de Entrar/Começar — só nessa altura
  // é que faz sentido perguntar se querem instalar a app antes de seguir
  // para login/registo. Mostra-se no máximo uma vez por browser
  // (INSTALL_SEEN_KEY), e só quando há algo de facto acionável: no iOS
  // mostramos sempre as instruções manuais (Safari não tem prompt nativo);
  // no Android/Desktop só interrompe se o browser já disparou o
  // beforeinstallprompt (Chrome/Edge — Firefox/Safari desktop não o
  // suportam, e nesse caso deixamos o clique seguir normalmente).
  function handleEntryClick(e, path) {
    if (isInstalled()) return;
    if (localStorage.getItem(INSTALL_SEEN_KEY)) return;
    const actionable = platform === "ios" || canPrompt;
    if (!actionable) return;
    e.preventDefault();
    setInstallTarget(path);
  }

  function dismissInstallModal() {
    localStorage.setItem(INSTALL_SEEN_KEY, "1");
    const target = installTarget;
    setInstallTarget(null);
    if (target) navigate(target);
  }

  async function handleInstallClick() {
    await triggerInstall();
    dismissInstallModal();
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* NAV — em ecrãs < 640px o seletor de língua + "Entrar" + "Começar
          grátis" ficavam todos em linha com o logo, sem wrap, e
          transbordavam num telemóvel real (5 jul 2026). Primeira correção
          escondia também o seletor de língua abaixo de sm — revertido
          ainda no mesmo dia: o utilizador reportou que isso tira a troca
          de idioma da landing page em Android, o que é perda de função
          real (site é multi-língua, o seletor é a única forma de mudar
          idioma antes de entrar). Mantém-se o seletor sempre visível; só
          "Entrar" fica escondido abaixo de sm — isso já é suficiente para
          caber em ~360px (logo + select + botão "Começar grátis"). */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink-0">
            <img src={logo} alt="Wallet76" className="h-7 sm:h-8 w-auto shrink-0" />
            <span className="text-base sm:text-lg font-extrabold tracking-tight text-white truncate">Wallet76</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
            <a href="#features" className="hover:text-white transition-colors">{c.nav_features}</a>
            <a href="#security" className="hover:text-white transition-colors">{c.nav_security}</a>
            <a href="#pricing" className="hover:text-white transition-colors">{c.nav_pricing}</a>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg px-1.5 sm:px-2 py-1.5 text-xs text-zinc-300 focus:outline-none">
              <option value="en">EN</option>
              <option value="pt">PT</option>
              <option value="fr">FR</option>
              <option value="de">DE</option>
              <option value="it">IT</option>
              <option value="es">ES</option>
            </select>
            <Link to="/login" onClick={(e) => handleEntryClick(e, "/login")} className="hidden sm:inline-block text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5">{c.nav_login}</Link>
            <Link to="/register" onClick={(e) => handleEntryClick(e, "/register")} className="text-xs sm:text-sm bg-white text-zinc-950 font-semibold px-3 sm:px-4 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors whitespace-nowrap">{c.nav_start}</Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden pt-24 pb-16 md:pt-32 md:pb-24">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-500/10 rounded-full blur-3xl" />
          <div className="absolute top-20 right-1/4 w-[300px] h-[300px] bg-emerald-500/8 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-zinc-700/60 bg-zinc-900/60 text-xs text-zinc-400">
            <Zap className="w-3 h-3 text-amber-400" />{c.badge}
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight mb-6">
            <span className="bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">{c.hero1}</span>
            <br />
            {/* 7 jul 2026: era azul->ciano->verde; pedido para dar mais destaque
                de "crescimento" — fica só em tons de verde (emerald->lime) em
                vez de verde->vermelho, para não ler como "o património está a
                cair" numa frase de vendas (vermelho = perdas em toda a app). */}
            <span className="bg-gradient-to-r from-emerald-400 to-lime-400 bg-clip-text text-transparent">{c.hero2}</span>
          </h1>
          <p className="max-w-2xl mx-auto text-zinc-400 text-lg leading-relaxed mb-10">{c.hero_sub}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link to="/register" onClick={(e) => handleEntryClick(e, "/register")} className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-zinc-950 font-semibold rounded-xl hover:bg-zinc-100 transition-colors text-sm">
              {c.cta_primary} <ChevronRight className="w-4 h-4" />
            </Link>
            <a href="#features" className="inline-flex items-center gap-2 px-7 py-3.5 border border-zinc-700 rounded-xl text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors text-sm">
              {c.cta_secondary}
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 mb-16">
            {[
              { Icon: Eye,          label: c.trust5 },
              { Icon: Lock,         label: c.trust1 },
              { Icon: ShieldCheck,  label: c.trust2 },
              { Icon: Server,       label: c.trust3 },
              { Icon: Check,        label: c.trust4 },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-zinc-500">
                <Icon className="w-3.5 h-3.5 text-emerald-400" />{label}
              </div>
            ))}
          </div>
          <div className="max-w-4xl mx-auto">
            <MockDashboard c={c} />
          </div>
        </div>
      </section>

      {/* BROKERS */}
      <div className="border-y border-zinc-800/60 bg-zinc-900/30 py-5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-center">
          <span className="text-xs text-zinc-500 font-semibold uppercase tracking-widest">{c.integrations_label}:</span>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            {["DEGIRO","Interactive Brokers","Trading 212","Binance","Coinbase","Kraken"].map((b) => (
              <span key={b} className="text-sm font-semibold text-zinc-500 hover:text-zinc-300 transition-colors">{b}</span>
            ))}
          </div>
          <span className="text-xs text-zinc-600 hidden sm:inline">·</span>
          <span className="text-xs text-zinc-600">{c.integrations_or} <span className="text-zinc-400 font-semibold">{c.integrations_formats}</span></span>
        </div>
      </div>

      {/* DOWNLOADS — 10 jul 2026 (pedido: "deveria ter la os arquivos para
          download tipo para PC, Android etc... com as versões"). Windows e
          Android têm um link real e estável para GitHub Releases (versão
          buscada em runtime a app-version.json / desktop-version.json, os
          mesmos ficheiros que o ApkUpdateBanner.jsx e o novo
          windows-build.yml mantêm atualizados). Mac/iOS/outros browsers não
          têm ficheiro nenhum para descarregar — usam o mesmo mecanismo de
          instalação PWA (triggerInstall) já usado no resto da página. */}
      <section id="downloads" className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">{c.dl_title}</h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">{c.dl_sub}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Windows */}
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-6 flex flex-col">
            <div className="w-10 h-10 rounded-xl border flex items-center justify-center mb-4 text-blue-400 bg-blue-500/10 border-blue-500/20">
              <MonitorSmartphone className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-zinc-100 mb-2">{c.dl_windows}</h3>
            <p className="text-zinc-500 text-sm leading-relaxed mb-4 flex-1">{c.dl_windows_desc}</p>
            {desktopInfo?.versionName && (
              <div className="text-[11px] font-mono text-zinc-600 mb-3">{c.dl_version} {desktopInfo.versionName}</div>
            )}
            <a
              href={desktopInfo?.downloadUrl || "https://github.com/entredonos/wallet76/releases/download/windows-latest/Wallet76-Setup.exe"}
              className="inline-flex items-center justify-center gap-2 py-2.5 border border-zinc-700 rounded-xl text-zinc-200 font-medium hover:border-zinc-500 hover:text-white transition-colors text-sm"
              data-testid="download-windows"
            >
              <Download className="w-4 h-4" /> {c.dl_btn}
            </a>
          </div>

          {/* Android */}
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-6 flex flex-col">
            <div className="w-10 h-10 rounded-xl border flex items-center justify-center mb-4 text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-zinc-100 mb-2">{c.dl_android}</h3>
            <p className="text-zinc-500 text-sm leading-relaxed mb-4 flex-1">{c.dl_android_desc}</p>
            {androidInfo?.latestVersionName && (
              <div className="text-[11px] font-mono text-zinc-600 mb-3">{c.dl_version} {androidInfo.latestVersionName}</div>
            )}
            <a
              href={androidInfo?.downloadUrl || "https://github.com/entredonos/wallet76/releases/download/android-latest/app-debug.apk"}
              className="inline-flex items-center justify-center gap-2 py-2.5 border border-zinc-700 rounded-xl text-zinc-200 font-medium hover:border-zinc-500 hover:text-white transition-colors text-sm"
              data-testid="download-android"
            >
              <Download className="w-4 h-4" /> {c.dl_btn}
            </a>
          </div>

          {/* Mac / iOS / Web (PWA) */}
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-6 flex flex-col">
            <div className="w-10 h-10 rounded-xl border flex items-center justify-center mb-4 text-purple-400 bg-purple-500/10 border-purple-500/20">
              <Globe2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-zinc-100 mb-2">{c.dl_web}</h3>
            <p className="text-zinc-500 text-sm leading-relaxed mb-4 flex-1">
              {c.dl_web_desc}
              {platform === "ios" && <span className="block mt-2 text-zinc-600 text-xs">{c.dl_ios_hint}</span>}
            </p>
            {platform === "ios" ? (
              <a
                href="/login"
                onClick={(e) => handleEntryClick(e, "/login")}
                className="inline-flex items-center justify-center gap-2 py-2.5 border border-zinc-700 rounded-xl text-zinc-200 font-medium hover:border-zinc-500 hover:text-white transition-colors text-sm"
                data-testid="download-web-ios"
              >
                {c.dl_web_btn}
              </a>
            ) : (
              <button
                type="button"
                onClick={canPrompt ? handleInstallClick : () => navigate("/login")}
                className="inline-flex items-center justify-center gap-2 py-2.5 border border-zinc-700 rounded-xl text-zinc-200 font-medium hover:border-zinc-500 hover:text-white transition-colors text-sm"
                data-testid="download-web"
              >
                <Download className="w-4 h-4" /> {c.dl_web_btn}
              </button>
            )}
          </div>

        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">{c.feat_title}</h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">{c.feat_sub}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {c.features.map((f, i) => {
            const Icon = FEAT_ICONS[i % FEAT_ICONS.length];
            return (
              <div key={f.title} className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-6 hover:border-zinc-700 hover:bg-zinc-900/70 transition-all">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${FEAT_COLORS[i % FEAT_COLORS.length]}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-zinc-100 mb-2">{f.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAMILY / MULTI-WALLET SHOWCASE — 10 jul 2026 (pedido: destacar em
          grande a organização multi-carteira já existente, com um exemplo
          concreto tipo "uma carteira para os filhos, outra para a mulher,
          controla tudo junto"). Mockup ilustrativo em código, mesmo estilo
          do MockDashboard do hero — sem dados/nomes reais de ninguém. */}
      <section className="py-24 border-t border-zinc-800/60 bg-zinc-900/20">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full border border-purple-500/30 bg-purple-500/10 text-xs text-purple-300">
              <Users className="w-3.5 h-3.5" /> {c.family_badge}
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-5 tracking-tight">{c.family_title}</h2>
            <p className="text-zinc-400 text-lg leading-relaxed">{c.family_sub}</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl shadow-purple-500/10">
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4 mb-3 flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{c.family_total_label}</span>
              <span className="text-xl font-mono font-bold text-zinc-100">$186,420</span>
            </div>
            <div className="space-y-2.5">
              {[
                { label: c.family_wallet1, Icon: Wallet,   val: "$98,120", pct: "+18.4%", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                { label: c.family_wallet2, Icon: Baby,     val: "$21,300", pct: "+6.1%",  color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { label: c.family_wallet3, Icon: Heart,    val: "$52,900", pct: "+11.7%", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
                { label: c.family_wallet4, Icon: Bitcoin,  val: "$14,100", pct: "-4.2%",  color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
              ].map((w) => (
                <div key={w.label} className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800/50 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${w.color}`}>
                      <w.Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm text-zinc-200 truncate">{w.label}</span>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-sm font-mono text-zinc-100">{w.val}</div>
                    <div className={`text-[11px] font-mono ${w.pct.startsWith("-") ? "text-rose-400" : "text-emerald-400"}`}>{w.pct}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-center text-[11px] font-mono text-zinc-600">{c.family_switch_hint}</div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <div className="py-16 border-y border-zinc-800/60 bg-gradient-to-r from-zinc-900/60 to-zinc-950">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {c.stats.map((s) => (
            <div key={s.label}>
              <div className="text-4xl md:text-5xl font-extrabold font-mono bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent mb-1">{s.value}</div>
              <div className="text-zinc-500 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
        {/* Languages pills */}
        <div className="max-w-7xl mx-auto px-6 mt-8 flex flex-wrap items-center justify-center gap-2">
          {langs.map((l) => (
            <span key={l} className="px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-400 font-medium">{l}</span>
          ))}
        </div>
      </div>

      {/* SECURITY */}
      <section id="security" className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" /> {c.sec_badge}
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">{c.sec_title}</h2>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">{c.sec_sub}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {c.security.map((s, i) => {
            const Icon = SEC_ICONS[i % SEC_ICONS.length];
            return (
              <div key={s.title} className="rounded-2xl border border-emerald-500/10 bg-emerald-500/5 p-6 hover:border-emerald-500/20 transition-all">
                <div className="w-10 h-10 rounded-xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center mb-4 text-emerald-400">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-zinc-100 mb-2">{s.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{s.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* PRICING — 3 colunas lado a lado */}
      <section id="pricing" className="py-24 border-t border-zinc-800/60 bg-zinc-900/20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">{c.plan_title}</h2>
            <p className="text-zinc-400 text-lg">{c.plan_sub}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">

            {/* FREE */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-7 flex flex-col">
              <div className="mb-5">
                <div className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{c.free_label}</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-extrabold font-mono text-zinc-100">{c.free_price}</span>
                  <span className="text-zinc-500 mb-1 text-sm ml-1">{c.free_period}</span>
                </div>
                <p className="text-xs text-zinc-600">{c.free_desc}</p>
              </div>
              <div className="space-y-2 mb-6 flex-1">
                {c.free_features.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />{f}
                  </div>
                ))}
                {c.free_limits.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-sm text-zinc-700">
                    <X className="w-4 h-4 text-zinc-800 mt-0.5 shrink-0" />{f}
                  </div>
                ))}
              </div>
              <Link to="/register" onClick={(e) => handleEntryClick(e, "/register")} className="block w-full text-center py-2.5 border border-zinc-700 rounded-xl text-zinc-300 font-medium hover:border-zinc-500 hover:text-white transition-colors text-sm">
                {c.btn_free}
              </Link>
            </div>

            {/* PRO MONTHLY */}
            <div className="relative rounded-2xl border border-blue-500/40 bg-gradient-to-b from-blue-500/10 to-zinc-900/60 p-7 flex flex-col shadow-xl shadow-blue-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap">
                {c.most_popular}
              </div>
              <div className="mb-5">
                <div className="text-xs font-mono uppercase tracking-widest text-blue-400 mb-2">{c.monthly_label}</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-extrabold font-mono text-zinc-100">{c.monthly_price}</span>
                  <span className="text-zinc-500 mb-1 text-sm ml-1">{c.monthly_period}</span>
                </div>
                <p className="text-xs text-zinc-600">{c.monthly_desc}</p>
              </div>
              <div className="space-y-2 mb-6 flex-1">
                {c.pro_features.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-sm text-zinc-200">
                    <Check className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />{f}
                  </div>
                ))}
              </div>
              <Link to="/register" onClick={(e) => handleEntryClick(e, "/register")} className="block w-full text-center py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold transition-colors text-sm">
                {c.btn_monthly}
              </Link>
              <p className="text-center text-[11px] text-zinc-600 mt-2">{c.pro_trial}</p>
            </div>

            {/* PRO ANNUAL */}
            <div className="relative rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/8 to-zinc-900/60 p-7 flex flex-col shadow-xl shadow-emerald-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap">
                {c.best_value}
              </div>
              <div className="mb-5">
                <div className="text-xs font-mono uppercase tracking-widest text-emerald-400 mb-2">{c.annual_label}</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-extrabold font-mono text-zinc-100">{c.annual_price}</span>
                  <span className="text-zinc-500 mb-1 text-sm ml-1">{c.annual_period}</span>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-zinc-600">{c.annual_desc}</p>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold shrink-0">{c.annual_save}</span>
                </div>
              </div>
              <div className="space-y-2 mb-6 flex-1">
                {c.pro_features.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-sm text-zinc-200">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />{f}
                  </div>
                ))}
              </div>
              <Link to="/register" onClick={(e) => handleEntryClick(e, "/register")} className="block w-full text-center py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-semibold transition-colors text-sm">
                {c.btn_annual}
              </Link>
              <p className="text-center text-[11px] text-zinc-600 mt-2">{c.pro_trial}</p>
            </div>

          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-28 relative overflow-hidden border-t border-zinc-800/60">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-500/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-5 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {c.cta2_title}
          </h2>
          <p className="text-zinc-400 text-lg mb-10">{c.cta2_sub}</p>
          <Link to="/register" onClick={(e) => handleEntryClick(e, "/register")} className="inline-flex items-center gap-2 px-8 py-4 bg-white text-zinc-950 font-bold rounded-xl hover:bg-zinc-100 transition-colors text-base">
            {c.cta2_btn} <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-zinc-800/60 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Wallet76" className="h-6 w-auto opacity-60" />
            <span className="text-sm font-bold text-zinc-500">Wallet76</span>
            <span className="text-sm text-zinc-600">© {new Date().getFullYear()} · {c.footer_rights}</span>
          </div>
          <div className="flex flex-wrap gap-5 text-xs text-zinc-600">
            <Link to="/login" onClick={(e) => handleEntryClick(e, "/login")} className="hover:text-zinc-300 transition-colors">{c.footer_login}</Link>
            <Link to="/register" onClick={(e) => handleEntryClick(e, "/register")} className="hover:text-zinc-300 transition-colors">{c.footer_register}</Link>
            <Link to="/pricing" className="hover:text-zinc-300 transition-colors">{c.footer_pricing}</Link>
            <Link to="/privacy" className="hover:text-zinc-300 transition-colors">{c.footer_privacy}</Link>
            <Link to="/terms" className="hover:text-zinc-300 transition-colors">{c.footer_terms}</Link>
          </div>
        </div>
      </footer>

      {/* INSTALL PROMPT MODAL — só aparece ao clicar Entrar/Começar (ver
          handleEntryClick), no máximo uma vez por browser. Android/Desktop
          usam o beforeinstallprompt nativo (mesmo fluxo em ambos: Chrome/
          Edge desktop também instalam PWAs como app, dispensando o .exe);
          iOS mostra sempre as instruções manuais, já que o Safari não tem
          API de instalação programática. */}
      {installTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          role="dialog"
          aria-modal="true"
          aria-label={platform === "ios" ? c.ios_title : c.install_title}
          onClick={dismissInstallModal}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={dismissInstallModal}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
              aria-label={platform === "ios" ? c.ios_continue : c.install_continue}
              data-testid="install-modal-close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-xl border border-blue-500/30 bg-blue-500/10 flex items-center justify-center mb-4">
              <img src={logo} alt="Wallet76" className="w-7 h-7 object-contain" />
            </div>

            {platform === "ios" ? (
              <>
                <h3 className="text-lg font-semibold text-zinc-50 mb-2">{c.ios_title}</h3>
                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-sm text-zinc-300">
                    <span className="w-7 h-7 shrink-0 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                      <Share className="w-3.5 h-3.5 text-blue-400" />
                    </span>
                    {c.ios_step1}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-zinc-300">
                    <span className="w-7 h-7 shrink-0 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                      <SquarePlus className="w-3.5 h-3.5 text-blue-400" />
                    </span>
                    {c.ios_step2}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissInstallModal}
                  className="w-full py-2.5 bg-white text-zinc-950 font-semibold rounded-xl hover:bg-zinc-100 transition-colors text-sm"
                  data-testid="install-modal-ios-continue"
                >
                  {c.ios_continue}
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-zinc-50 mb-2">{c.install_title}</h3>
                <p className="text-sm text-zinc-400 mb-6">{c.install_body}</p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-white text-zinc-950 font-semibold rounded-xl hover:bg-zinc-100 transition-colors text-sm"
                    data-testid="install-modal-install-btn"
                  >
                    <Download className="w-4 h-4" /> {c.install_btn}
                  </button>
                  <button
                    type="button"
                    onClick={dismissInstallModal}
                    className="w-full py-2.5 border border-zinc-700 rounded-xl text-zinc-300 font-medium hover:border-zinc-500 hover:text-white transition-colors text-sm"
                    data-testid="install-modal-continue-btn"
                  >
                    {c.install_continue}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
