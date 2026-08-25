import { createClient } from "../lib/client";

const supabase = createClient();

export function Auth() {
  async function login(provider: "github" | "google") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      alert("Error while signing in");
    }
  }

  return (
    <div>
      <button onClick={() => login("google")}>login with Google</button>
      <button onClick={() => login("github")}>login with Github</button>
    </div>
  );
}
