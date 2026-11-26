import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { NotFoundError } from "../src/shared/errors.js";
import {
  normalizeUsername,
  usernameSchema,
  validateUsername,
} from "../src/shared/username.js";
import {
  PROFILE_CARD_BIO_MAX,
  formatUserHandle,
  identityDisplayName,
  isNavigableUserIdentity,
  legacyUserProfilePath,
  parseUsernameInput,
  stripHandlePrefix,
  truncateProfileCardBio,
  userProfilePath,
} from "../src/shared/user-identity.js";
import { buildProfileCardView } from "../src/server/modules/profiles/view.js";
import { UserIdentity } from "../src/web/components/users/UserIdentity.js";

describe("global user identity presentation rules", () => {
  it("renders handles with @ and never doubles the prefix", () => {
    expect(formatUserHandle("sally")).toBe("@sally");
    expect(formatUserHandle("@sally")).toBe("@sally");
    expect(formatUserHandle("@@sally")).toBe("@sally");
    expect(formatUserHandle("@Sally")).toBe("@sally");
    expect(formatUserHandle("  sally  ")).toBe("@sally");
  });

  it("parses @-prefixed input into stored identity syntax", () => {
    expect(parseUsernameInput("@Sally")).toBe("sally");
    expect(parseUsernameInput("sally")).toBe("sally");
    expect(parseUsernameInput("@sally")).not.toContain("@");
  });

  it("links known identities to the canonical /users/:username path", () => {
    expect(userProfilePath("sally")).toBe("/users/sally");
    expect(userProfilePath("@Sally")).toBe("/users/sally");
    expect(userProfilePath("sally")).not.toContain("/u/");
  });

  it("keeps /u/:username as a compatibility-only alias", () => {
    expect(legacyUserProfilePath("sally")).toBe("/u/sally");
    expect(legacyUserProfilePath("sally")).not.toBe(userProfilePath("sally"));
  });

  it("never persists @ as part of the username", () => {
    expect(normalizeUsername("@Sally")).toBe("sally");
    expect(stripHandlePrefix("@sally")).toBe("sally");
    expect(usernameSchema.parse("@Allie")).toBe("allie");
    // Normalized form is valid; the raw @ form is presentation only.
    expect(validateUsername("sally")).toBeNull();
    expect(usernameSchema.parse("sally")).not.toContain("@");
  });

  it("treats missing/empty identities as non-navigable", () => {
    expect(isNavigableUserIdentity(null)).toBe(false);
    expect(isNavigableUserIdentity(undefined)).toBe(false);
    expect(isNavigableUserIdentity({ username: "" })).toBe(false);
    expect(isNavigableUserIdentity({ username: "  " })).toBe(false);
    expect(isNavigableUserIdentity({ username: "@" })).toBe(false);
    expect(isNavigableUserIdentity({ username: "sally" })).toBe(true);
  });

  it("lets display names accompany but never substitute the handle", () => {
    expect(
      identityDisplayName({ username: "sally", displayName: "Sally" }),
    ).toBe("Sally");
    expect(identityDisplayName({ username: "sally", displayName: "  " })).toBe(
      "@sally",
    );
    expect(identityDisplayName({ username: "sally" })).toBe("@sally");
  });

  it("truncates hover-card bios to identity-sized previews", () => {
    expect(truncateProfileCardBio(null)).toBeNull();
    expect(truncateProfileCardBio("  ")).toBeNull();
    expect(truncateProfileCardBio("Short bio")).toBe("Short bio");
    const long = "x".repeat(PROFILE_CARD_BIO_MAX + 50);
    const truncated = truncateProfileCardBio(long);
    expect(truncated).not.toBeNull();
    expect(truncated!.length).toBeLessThanOrEqual(PROFILE_CARD_BIO_MAX);
  });
});

function cardDeps(args: {
  user?: Record<string, unknown> | null;
  canView?: boolean;
  pronouns?: string | null;
  followers?: number;
  isFollowing?: boolean;
}) {
  const user =
    args.user === undefined
      ? {
          id: "user-1",
          username: "sally",
          displayName: "Sally",
          avatarFileId: "avatar-1",
          bio: "Short bio",
        }
      : args.user;
  return {
    profiles: {
      findByUsername: async () => user,
      canViewProfileAsync: async () => args.canView !== false,
      avatarUrl: (fileId: string | null | undefined) =>
        fileId ? `/api/v1/files/${fileId}/content` : undefined,
    },
    platform: {
      getProfileRow: async () => ({ pronouns: args.pronouns ?? null }),
      getFollowState: async () => ({
        followers: args.followers ?? 3,
        following: 1,
        isFollowing: args.isFollowing ?? false,
      }),
    },
    db: {},
  };
}

describe("profile card endpoint contract", () => {
  it("returns identity-only card data for viewers who can access the profile", async () => {
    const deps = cardDeps({});
    const card = await buildProfileCardView(deps as never, "sally", "viewer-1");
    expect(card).toMatchObject({
      userId: "user-1",
      username: "sally",
      displayName: "Sally",
      avatarUrl: "/api/v1/files/avatar-1/content",
      pronouns: null,
      bio: "Short bio",
      followerCount: 3,
      viewerIsFollowing: false,
    });
    // Identity only: no activity, ratings, reviews, or full-profile payload.
    expect(card).not.toHaveProperty("artifacts");
    expect(card).not.toHaveProperty("activity");
    expect(card).not.toHaveProperty("counts");
  });

  it("truncates long bios server-side", async () => {
    const deps = cardDeps({
      user: {
        id: "user-1",
        username: "sally",
        displayName: "Sally",
        avatarFileId: null,
        bio: "y".repeat(PROFILE_CARD_BIO_MAX + 100),
      },
    });
    const card = await buildProfileCardView(deps as never, "sally", "viewer-1");
    expect(card.bio).not.toBeNull();
    expect(card.bio!.length).toBeLessThanOrEqual(PROFILE_CARD_BIO_MAX);
  });

  it("reflects pronouns and follow state", async () => {
    const deps = cardDeps({ pronouns: "she/her", isFollowing: true });
    const card = await buildProfileCardView(deps as never, "sally", "viewer-1");
    expect(card.pronouns).toBe("she/her");
    expect(card.viewerIsFollowing).toBe(true);
  });

  it("withholds card metadata from viewers who cannot access the profile", async () => {
    const deps = cardDeps({ canView: false });
    await expect(
      buildProfileCardView(deps as never, "sally", "viewer-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns not-found for missing users without leaking existence details", async () => {
    const deps = cardDeps({ user: null });
    await expect(
      buildProfileCardView(deps as never, "ghost", "viewer-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("UserIdentity canonical rendering", () => {
  function render(
    user: unknown,
    variant: "handle" | "compact" | "full" = "compact",
  ) {
    return renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(UserIdentity, {
          user: user as never,
          variant,
          withHoverCard: false,
        }),
      ),
    );
  }

  it("links every variant to the canonical profile path", () => {
    for (const variant of ["handle", "compact", "full"] as const) {
      const html = render({ username: "sally", displayName: "Sally" }, variant);
      expect(html).toContain('href="/users/sally"');
      expect(html).not.toContain("/u/sally");
      expect(html).toContain("@sally");
    }
  });

  it("renders handle-only variant without the display name", () => {
    const html = render({ username: "sally", displayName: "Sally" }, "handle");
    expect(html).toContain("@sally");
    expect(html).not.toContain(">Sally<");
  });

  it("renders deleted/missing users as non-navigable text", () => {
    for (const user of [null, undefined, { username: "" }]) {
      const html = render(user);
      expect(html).not.toContain("href=");
      expect(html).not.toContain("@sally");
    }
  });

  it("applies display-name cosmetics even when the name mirrors the handle", () => {
    const html = render(
      {
        username: "sally",
        displayName: "sally",
        cosmetics: {
          usernameStyle: "gradient",
          usernameColor: "rose",
          usernameAccentColor: "gold",
        },
      },
      "compact",
    );
    expect(html).toContain("--profile-name-color:var(--color-accent-rose)");
    expect(html).toContain("--profile-name-accent:var(--color-icon-identity-secondary)");
  });

  it("applies cosmetics when the display name is only a casing variant of the handle", () => {
    const html = render(
      {
        username: "sally",
        displayName: "Sally",
        cosmetics: { usernameStyle: "bold", usernameColor: "#3366ff", usernameAccentColor: null },
      },
      "compact",
    );
    expect(html).toContain("--profile-name-color:#3366ff");
  });
});
