import type { PublicProfile } from "../utils/types";
import { initialOf, nameOf } from "../utils/format";

function Avatar({ profile, large = false }: { profile: PublicProfile | null | undefined; large?: boolean }) {
  return (
    <span className={`avatar${large ? " avatar-lg" : ""}`} aria-hidden="true">
      {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initialOf(profile)}
      <span className="visually-hidden">{nameOf(profile)}</span>
    </span>
  );
}

export default Avatar;
