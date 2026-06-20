import React from 'react';
import PageHeader from './PageHeader';

const Section = ({ title, children }) => (
  <section className="rounded-xl shadow-xl overflow-hidden border border-gray-600" style={{ backgroundColor: '#35373b' }}>
    <div className="px-6 py-4 border-b border-purple-500/30" style={{ backgroundColor: 'rgba(145,71,255,0.08)' }}>
      <h2 className="text-base font-semibold text-white tracking-wide">{title}</h2>
    </div>
    <div className="px-6 py-5 text-sm text-gray-300 space-y-3 leading-relaxed">
      {children}
    </div>
  </section>
);

export default function PrivacyPolicy() {
  React.useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <PageHeader title="Privacy Policy" />
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-1">Privacy Policy</h1>
        <p className="text-xs text-gray-500">Last updated: June 20, 2026</p>
      </div>

      <Section title="Who We Are">
        <p>
          Pokeboard.net ("we", "us", "our") is a fan-made community website for tracking Pokémon shiny hunting
          bingo competitions. We are not affiliated with or endorsed by Nintendo, Game Freak, Creatures Inc.,
          or The Pokémon Company.
        </p>
        <p>
          Questions about this policy can be directed to us through the Suggestions & Bugs form available
          in the site menu.
        </p>
      </Section>

      <Section title="What Data We Collect">
        <p>
          <span className="text-white font-medium">Discord account data</span> — when you log in with Discord,
          we receive and store your Discord user ID, username, display name, profile picture URL, and the email
          address associated with your Discord account. This data is provided by Discord as part of the OAuth
          login process and is required to create and identify your account.
        </p>
        <p>
          <span className="text-white font-medium">Twitch URL</span> — if you add a Twitch channel link to
          your profile, we store it to display a live indicator on the leaderboard. This is entirely optional.
        </p>
        <p>
          <span className="text-white font-medium">Submission content</span> — when you submit a Pokémon catch
          for approval, we store the proof image or link you provide, the Pokémon details, and the associated
          game metadata.
        </p>
        <p>
          <span className="text-white font-medium">Activity data</span> — we record your catch approvals,
          bingo achievements, badge awards, and points for the purpose of running the competition.
        </p>
        <p>
          We do <span className="text-white font-medium">not</span> collect your real name, location, payment
          information, or any data beyond what is described above.
        </p>
      </Section>

      <Section title="How We Use Your Data">
        <ul className="list-disc list-inside space-y-1.5">
          <li>To authenticate you and maintain your account</li>
          <li>To display your progress, rank, and achievements on the leaderboard and your profile</li>
          <li>To process and moderate your Pokémon catch submissions</li>
          <li>To award badges and track competition standings</li>
          <li>To show your Twitch live status to other users (if you provide a Twitch URL)</li>
        </ul>
        <p>
          We do not sell, rent, or share your personal data with third parties for marketing or advertising
          purposes. We do not use your data for automated decision-making that has legal or similarly significant
          effects on you.
        </p>
      </Section>

      <Section title="Third-Party Services">
        <p>
          We use the following third-party infrastructure to operate the site:
        </p>
        <ul className="list-disc list-inside space-y-1.5">
          <li>
            <span className="text-white font-medium">Supabase</span> — our database and authentication provider.
            Your account data and competition records are stored on Supabase-hosted PostgreSQL servers.
            See <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">supabase.com/privacy</a>.
          </li>
          <li>
            <span className="text-white font-medium">Cloudflare R2</span> — proof images you upload are stored
            on Cloudflare R2 object storage.
            See <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">cloudflare.com/privacypolicy</a>.
          </li>
          <li>
            <span className="text-white font-medium">Discord</span> — we use Discord OAuth for login.
            See <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">discord.com/privacy</a>.
          </li>
          <li>
            <span className="text-white font-medium">Twitch</span> — we query the Twitch API to check
            live stream status for users who have provided a Twitch URL.
            See <a href="https://www.twitch.tv/p/legal/privacy-notice/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">twitch.tv/p/legal/privacy-notice</a>.
          </li>
          <li>
            <span className="text-white font-medium">Vercel</span> — our site and API are hosted on Vercel.
            See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">vercel.com/legal/privacy-policy</a>.
          </li>
        </ul>
      </Section>

      <Section title="Data Retention and Deletion">
        <p>
          We retain your account data and competition history for as long as your account is active or as
          needed to operate the site. If you would like your account and data removed, contact us through
          the Suggestions & Bugs form. We will delete your account data within a reasonable time of receiving
          your request.
        </p>
        <p>
          Note that historical leaderboard records and competition standings may be anonymized and retained
          even after account deletion to preserve the integrity of past competition results.
        </p>
      </Section>

      <Section title="Cookies and Local Storage">
        <p>
          We use browser local storage to maintain your login session via Supabase authentication tokens.
          We do not use advertising cookies or third-party tracking cookies.
        </p>
      </Section>

      <Section title="Children's Privacy">
        <p>
          This site is not directed at children under 13. We do not knowingly collect personal information
          from children under 13. If you believe a child has provided us with personal information, please
          contact us so we can remove it.
        </p>
      </Section>

      <Section title="EU and UK Users (GDPR)">
        <p>
          If you are located in the European Union or United Kingdom, the following additional information
          applies to you under the General Data Protection Regulation (GDPR) and UK GDPR.
        </p>
        <p>
          <span className="text-white font-medium">Lawful basis for processing.</span> We process your
          personal data on the basis of <span className="text-white font-medium">contractual necessity</span> —
          the data is required to provide the service you signed up for (your account, competition
          participation, and leaderboard standings).
        </p>
        <p>
          <span className="text-white font-medium">International transfers.</span> Your data is stored and
          processed in the United States via Supabase and Vercel. These transfers are covered by Standard
          Contractual Clauses (SCCs) as provided by those services.
        </p>
        <p>
          <span className="text-white font-medium">Your rights.</span> You have the right to:
        </p>
        <ul className="list-disc list-inside space-y-1.5">
          <li><span className="text-white font-medium">Access</span> — request a copy of the personal data we hold about you.</li>
          <li><span className="text-white font-medium">Rectification</span> — ask us to correct inaccurate data.</li>
          <li><span className="text-white font-medium">Erasure</span> — request deletion of your personal data.</li>
          <li><span className="text-white font-medium">Restriction</span> — ask us to limit how we process your data.</li>
          <li><span className="text-white font-medium">Portability</span> — receive your data in a structured, machine-readable format.</li>
          <li><span className="text-white font-medium">Objection</span> — object to processing based on legitimate interests.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us through the Suggestions & Bugs form in the site menu.
          You also have the right to lodge a complaint with your local data protection authority (e.g., the
          ICO in the UK or your national supervisory authority in the EU).
        </p>
      </Section>

      <Section title="Changes to This Policy">
        <p>
          We may update this privacy policy from time to time. Changes will be posted on this page with an
          updated date. Continued use of the site after changes are posted constitutes your acceptance of
          the revised policy.
        </p>
      </Section>
    </main>
  );
}
