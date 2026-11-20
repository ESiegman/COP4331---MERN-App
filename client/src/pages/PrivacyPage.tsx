import { Link } from "react-router-dom";
import { CONTACT_EMAIL, REPO_URL } from "../utils/site";

// Linked from the footer and the sign-up page, and given to Google for its sign-in review.
// If what the site stores or who it talks to changes, change this page too.
function PrivacyPage() {
  const contact = CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  ) : (
    <>the team through the project's <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub page</a></>
  );

  return (
    <main className="page legal">
      <h1 className="h2 mb-1">Privacy policy</h1>
      <p className="muted">Last updated November 17, 2026</p>

      <p>
        Tier List lets you make tier lists, rank things, and see how others ranked them. This page explains what the
        site keeps about you and what happens to it.
      </p>

      <h2 className="h5">What we store</h2>
      <ul>
        <li>Your <strong>email address</strong> and <strong>username</strong>.</li>
        <li>
          A <strong>password</strong>, if you made one. It is stored only as a one-way hash, so nobody, including us, can read it.
          Accounts created with Google or Discord have no password unless you set one.
        </li>
        <li>
          If you sign in with <strong>Google or Discord</strong>: your <strong>name</strong> and <strong>profile picture</strong> from that
          account, which become your starting display name and avatar, along with the email that provider verified and an id that
          tells the two accounts apart. We never see your Google or Discord password.
        </li>
        <li>What you add to the site: your <strong>templates</strong>, <strong>rankings</strong>, <strong>comments</strong>, likes, profile text and notification settings.</li>
        <li>Notifications about activity on your content, and, if you use the mobile app, a token that lets us send push notifications to your phone.</li>
        <li>Records of moderation actions, such as a removed comment or a ban, with the reason.</li>
      </ul>

      <h2 className="h5">What other people can see</h2>
      <p>
        Your username, display name, picture, bio and public templates, rankings and comments are visible to anyone. Rankings and
        templates marked <em>unlisted</em> can be opened by anyone with the link, and <em>private</em> ones only by you. Your email
        address is never shown to other people.
      </p>

      <h2 className="h5">We don't sell your data</h2>
      <p>
        We don't sell your information and we don't use it for advertising. It is shared only with the services that are needed to
        run the site:
      </p>
      <ul>
        <li><strong>Google or Discord</strong>, when you choose to sign in with them.</li>
        <li>An <strong>email service</strong>, which delivers verification and password reset emails.</li>
        <li><strong>Expo's push service</strong>, which delivers push notifications to the mobile app.</li>
        <li>
          <strong>Anthropic</strong>, only when you press "Suggest items with AI": the title you typed is sent to produce the
          suggestions.
        </li>
        <li>Our <strong>hosting provider</strong>, which stores the site's database.</li>
      </ul>

      <h2 className="h5">Cookies and local storage</h2>
      <p>
        We don't use advertising or tracking cookies. Your browser keeps your login in local storage so you stay signed in, and uses
        temporary session storage while you sign in with Google or Discord.
      </p>

      <h2 className="h5">Deleting your account</h2>
      <p>
        You can delete your account yourself: log in, open <Link to="/settings">Settings</Link> and press <strong>Delete my account</strong>{" "}
        at the bottom of the page. If your account has a password you will be asked for it. The account is deleted straight away,
        together with its templates (and the rankings other people made from them), rankings, comments, likes, notifications and
        uploaded pictures. The moderation log keeps its entries but shows you as a deleted user. You can also unlink Google or Discord,
        change your display name and picture, or clear your bio at any time in Settings.
      </p>
      <p>
        If you can't log in, contact {contact} from the email address on the account and we will delete it for you.
      </p>

      <h2 className="h5">Changes</h2>
      <p className="mb-0">If this policy changes, the date at the top changes too.</p>
    </main>
  );
}

export default PrivacyPage;
