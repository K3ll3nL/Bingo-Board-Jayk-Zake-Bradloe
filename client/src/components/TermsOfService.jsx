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

export default function TermsOfService() {
  React.useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <PageHeader title="Terms of Service" />
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-1">Terms of Service</h1>
        <p className="text-xs text-gray-500">Last updated: June 20, 2026</p>
      </div>

      <Section title="Acceptance of Terms">
        <p>
          By accessing or using Pokeboard.net ("the Site"), you agree to be bound by these Terms of Service.
          If you do not agree, do not use the Site.
        </p>
        <p>
          We reserve the right to update these terms at any time. Continued use of the Site after changes
          are posted constitutes your acceptance of the updated terms.
        </p>
      </Section>

      <Section title="Fan Site Disclaimer">
        <p>
          Pokeboard.net is an unofficial, fan-made community website. We are not affiliated with, endorsed
          by, or connected to Nintendo Co., Ltd., Game Freak Inc., Creatures Inc., or The Pokémon Company.
        </p>
        <p>
          Pokémon and all related names, characters, and imagery are trademarks of Nintendo / Creatures Inc.
          / GAME FREAK inc. All rights reserved. No copyright infringement is intended.
        </p>
      </Section>

      <Section title="Eligibility">
        <p>
          You must be at least 13 years of age to use this Site. By using the Site, you represent that you
          meet this requirement. If you are under 18, you represent that you have permission from a parent
          or guardian.
        </p>
      </Section>

      <Section title="User Accounts">
        <p>
          Accounts are created by logging in with Discord. You are responsible for maintaining the security
          of your Discord account. You may not share your account or use another person's account.
        </p>
        <p>
          We may suspend or terminate accounts that violate these terms or that engage in conduct harmful
          to the community, at our sole discretion.
        </p>
      </Section>

      <Section title="Competition Rules and Fair Play">
        <p>
          The Site hosts Pokémon shiny hunting bingo competitions. By participating, you agree to the
          following:
        </p>
        <ul className="list-disc list-inside space-y-1.5">
          <li>All submitted catches must be legitimately obtained in an unmodified game without the use of
            save editors, hacking tools, glitch exploits that produce illegitimate Pokémon, or any other
            form of cheating.</li>
          <li>Proof submitted with each catch (screenshots, video clips) must accurately depict the catch
            being claimed and must not be falsified, edited, or taken from another player's game.</li>
          <li>You may only submit catches that belong to you.</li>
          <li>Moderators have final authority over submission approvals and rejections. Attempting to
            circumvent moderation decisions (e.g., creating new accounts after a ban) is prohibited.</li>
        </ul>
        <p>
          Violations of fair play rules may result in submission rejection, point deductions, badge removal,
          or permanent account suspension.
        </p>
      </Section>

      <Section title="User-Submitted Content">
        <p>
          When you submit proof images, links, or other content to the Site, you retain ownership of that
          content. However, you grant us a non-exclusive, royalty-free license to store, display, and use
          that content for the purpose of operating the Site and the competition.
        </p>
        <p>
          You represent that you have the right to submit any content you provide and that it does not
          violate any third-party rights.
        </p>
        <p>
          We do not actively monitor all user content, but we reserve the right to remove content that
          violates these terms or that we deem inappropriate.
        </p>
      </Section>

      <Section title="Prohibited Conduct">
        <p>You agree not to:</p>
        <ul className="list-disc list-inside space-y-1.5">
          <li>Submit fraudulent or falsified catch proof</li>
          <li>Harass, threaten, or abuse other users or moderators</li>
          <li>Attempt to gain unauthorized access to the Site, other accounts, or our servers</li>
          <li>Use automated scripts or bots to interact with the Site</li>
          <li>Interfere with the normal operation of the Site</li>
          <li>Use the Site for any unlawful purpose</li>
        </ul>
      </Section>

      <Section title="Disclaimer of Warranties">
        <p>
          The Site is provided <span className="text-white font-medium">"as is"</span> and{' '}
          <span className="text-white font-medium">"as available"</span> without warranties of any kind,
          express or implied. We do not guarantee that the Site will be uninterrupted, error-free, or
          free of harmful components.
        </p>
        <p>
          Competition standings, points, and badges are maintained on a best-effort basis. We are not
          liable for data loss, downtime, or errors in competition records.
        </p>
      </Section>

      <Section title="Limitation of Liability">
        <p>
          To the fullest extent permitted by applicable law, Pokeboard.net and its operators shall not be
          liable for any indirect, incidental, special, consequential, or punitive damages arising from
          your use of or inability to use the Site.
        </p>
      </Section>

      <Section title="Governing Law">
        <p>
          These terms are governed by the laws of the United States. Any disputes arising from these terms
          or your use of the Site shall be resolved in the applicable courts of the United States.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For questions about these terms, use the Suggestions & Bugs form available in the site menu.
        </p>
      </Section>
    </main>
  );
}
