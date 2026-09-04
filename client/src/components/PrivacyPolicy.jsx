import React from 'react';
import PageHeader from './PageHeader';
import PageBackground from './PageBackground';

const Section = ({ title, children }) => (
  <section className="rounded-xl shadow-xl overflow-hidden border border-gray-600" style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)' }}>
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
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
    <PageBackground />
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-5 select-text">
      <PageHeader title="Privacy Policy" />
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-1">Privacy Policy</h1>
        <p className="text-xs text-gray-500">Last updated: September 4, 2026</p>
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
          <span className="text-white font-medium">Account data from your login provider</span> - you can sign
          in with Discord, Google, or Twitch, and you may link more than one of these to the same account. From
          whichever provider you use we receive and store a user ID, your username and display name, and your
          profile picture URL. The email address associated with that provider is held by our authentication
          provider (Supabase) to identify your account; it is not shown on your profile or to other users.
          This data is required to create and identify your account.
        </p>
        <p>
          <span className="text-white font-medium">Profile links</span> - you may optionally add Twitch,
          YouTube, and ShinyDex links to your profile. These are shown publicly on your profile, and your
          Twitch link is additionally used to display a live indicator on the leaderboard. All are optional
          and can be removed at any time.
        </p>
        <p>
          <span className="text-white font-medium">Submission content</span> - when you submit a Pokémon catch
          for approval, we store the proof image or link you provide, the Pokémon details, and the associated
          game metadata.
        </p>
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <span className="text-white font-medium">Please read this before uploading proof.</span> Proof images
          are stored on public object storage. The web address of each image is long and random, so it is not
          listed anywhere and cannot realistically be guessed, but anyone who has the address can open the image
          without logging in. Treat a proof screenshot as something that could become public. Screenshots of a
          game console often capture more than the catch itself - in-game player names, friend codes, other
          players, notifications, or a streaming overlay showing your real name. Crop anything you would not
          want seen. Proof images are automatically deleted about 90 days after the submission is resolved.
        </p>
        <p>
          <span className="text-white font-medium">Activity data</span> - we record your catch approvals,
          bingo achievements, badge awards, and points for the purpose of running the competition.
        </p>
        <p>
          <span className="text-white font-medium">Moderation records</span> - if a submission is rejected, or
          if a moderator issues a strike under the Restricted Challenge rules, we store that outcome against
          your account so the rules can be applied consistently. Moderators may also attach a note to a
          decision explaining it.
        </p>
        <p>
          <span className="text-white font-medium">Feedback you send us</span> - if you use the Suggestions
          &amp; Bugs form, we store what you wrote along with your account ID so we can follow up.
        </p>
        <p>
          <span className="text-white font-medium">API keys</span> - if you generate an API key for the stream
          overlays, we store that key so it can be shown to you again and matched when your overlay calls us.
          Treat your key like a password: anyone who has it can read your overlay data. You can delete a key at
          any time from the Overlays page.
        </p>
        <p>
          We do <span className="text-white font-medium">not</span> collect your real name, location, or
          payment information. We do not use advertising, and we do not sell or share your data.
        </p>
        <p>
          <span className="text-white font-medium">Audience measurement</span> - we use Vercel Web Analytics
          to count page views and see which pages are used. It is privacy-preserving by design: it sets no
          cookies, stores nothing on your device, and does not build a profile of you or follow you across
          other sites. It does not receive your account details.
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
            <span className="text-white font-medium">Supabase</span> - our database and authentication provider.
            Your account data and competition records are stored on Supabase-hosted PostgreSQL servers.
            See <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">supabase.com/privacy</a>.
          </li>
          <li>
            <span className="text-white font-medium">Cloudflare R2</span> - proof images you upload are stored
            on Cloudflare R2 object storage.
            See <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">cloudflare.com/privacypolicy</a>.
          </li>
          <li>
            <span className="text-white font-medium">Discord</span> - one of the sign-in options.
            See <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">discord.com/privacy</a>.
          </li>
          <li>
            <span className="text-white font-medium">Google</span> - one of the sign-in options, used only if
            you choose to sign in or link with Google.
            See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">policies.google.com/privacy</a>.
          </li>
          <li>
            <span className="text-white font-medium">Twitch</span> - one of the sign-in options, and we
            query the Twitch API to check live stream status for users who have provided a Twitch URL.
            See <a href="https://www.twitch.tv/p/legal/privacy-notice/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">twitch.tv/p/legal/privacy-notice</a>.
          </li>
          <li>
            <span className="text-white font-medium">Vercel Web Analytics</span> - cookieless page-view
            measurement, described above.
            See <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">vercel.com/docs/analytics/privacy-policy</a>.
          </li>
          <li>
            <span className="text-white font-medium">Vercel</span> - our site and API are hosted on Vercel.
            See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">vercel.com/legal/privacy-policy</a>.
          </li>
        </ul>
      </Section>

      <Section title="Data Retention and Deletion">
        <p>
          <span className="text-white font-medium">Proof images</span> are deleted automatically about 90 days
          after a submission is resolved. This is done on a schedule, so an image may persist a short time past
          that point before the next run removes it.
        </p>
        <p>
          <span className="text-white font-medium">Account data and competition history</span> are kept for as
          long as your account is active or as needed to operate the site.
        </p>
        <p>
          If you would like your account and data removed, contact us through the Suggestions &amp; Bugs form
          in the site menu and say that you are requesting deletion. We will action it within 30 days. Deletion
          removes your profile, your profile links, your submission history and any remaining proof images,
          your feedback, and your API keys.
        </p>
        <p>
          Note that historical leaderboard records and competition standings may be anonymized and retained
          even after account deletion to preserve the integrity of past competition results.
        </p>
      </Section>

      <Section title="Cookies and Local Storage">
        <p>
          We use your browser's local storage to keep you signed in (via Supabase authentication tokens) and
          to remember small preferences on your own device - which banners you have dismissed, which items you
          have ticked off on the Restricted Challenge checklist, and which Pokémon you have marked as owned in
          the Gen 2 breeding tool.
        </p>
        <p>
          These preferences never leave your browser: they are not sent to us, not tied to your account, and
          not shared between your devices. Clearing your browser data removes them.
        </p>
        <p>
          We do not use advertising cookies or third-party tracking cookies of any kind, and our analytics
          sets no cookies at all.
        </p>
        <p>
          This is why you are not asked to accept cookies: everything we store on your device is either
          required to sign you in or is a preference you set yourself, and none of it is used to track you.
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
          personal data on the basis of <span className="text-white font-medium">contractual necessity</span> -
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
          <li><span className="text-white font-medium">Access</span> - request a copy of the personal data we hold about you.</li>
          <li><span className="text-white font-medium">Rectification</span> - ask us to correct inaccurate data.</li>
          <li><span className="text-white font-medium">Erasure</span> - request deletion of your personal data.</li>
          <li><span className="text-white font-medium">Restriction</span> - ask us to limit how we process your data.</li>
          <li><span className="text-white font-medium">Portability</span> - receive your data in a structured, machine-readable format.</li>
          <li><span className="text-white font-medium">Objection</span> - object to processing based on legitimate interests.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us through the Suggestions & Bugs form in the site menu.
          You also have the right to lodge a complaint with your local data protection authority (e.g., the
          ICO in the UK or your national supervisory authority in the EU).
        </p>
      </Section>

      <Section title="Generative AI and Your Data">
        <p>
          The code powering this Site is written with the assistance of AI coding tools
          (Anthropic's Claude), reviewed and approved by a human maintainer before deployment.
          We do <span className="text-white font-medium">not</span> feed your account data,
          submission content, or any other personal information into AI models.
        </p>
        <p>
          Site artwork is created by human artists - no generative AI is used for imagery -
          and submission moderation is performed by human moderators.
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
    </div>
  );
}
