import { useParams } from "react-router";
import { ProfileView } from "../../components/profile/ProfileView";

export function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  if (!username) return null;
  return <ProfileView username={username} />;
}
