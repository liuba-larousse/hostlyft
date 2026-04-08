import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
const allowedEmails = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(",").map((e) => e.trim().toLowerCase())
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  },
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      const email = profile?.email?.toLowerCase() ?? "";
      if (allowedEmails.length > 0) return allowedEmails.includes(email);
      if (allowedDomain) return email.endsWith(`@${allowedDomain}`);
      return email.includes("@");
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/signin",
  },
});
