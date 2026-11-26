# Historical Clubs design notes

The September 15, 2026 Clubs Revision scope decision supersedes the V1/V2 exclusions below for read history, nominations/selection, explicit sharing, member progress, derived club stats, and local Upcoming events. See [V1-SCOPE.md](V1-SCOPE.md) and [CLUBS-REVISION-AUDIT.md](CLUBS-REVISION-AUDIT.md) for current authority. The following notes are retained as historical context.

Yes. I think the key is to stop treating “Clubs” as a feature attached to books/video and instead define them as a first-class social container. The domain-specific behavior then sits inside the club.

A Club is a user-created group of people around a shared interest, collection, or activity. It can be public/joinable or private/invite-only. The club itself is fundamentally asynchronous: membership, discussion, topics, announcements, shared media, schedules, and organization happen there. Real-time experiences such as watch parties and listen-together sessions are activities that can be launched from a club, not what a club is.

That gives us a much cleaner model.

### Clubs — V1 scope

**Core club**

* Create a club
* Name, description, cover
* Owner
* Members
* Public/joinable or private/invite-only
* Join/leave/invite
* Member roles/permissions
* Club feed/activity
* Basic club settings
* Club can be associated with one or more media domains where appropriate

**Discussion / asynchronous activity**

* Owner/moderators can create discussion topics
* Members can post and reply
* Topics can be pinned/closed
* Basic announcements
* Basic moderation
* Topics can optionally be associated with a work/media item

This is the important part: **a discussion topic isn't necessarily tied to a particular media type.** A club could have “Introductions,” “What should we read next?”, “General discussion,” etc.

**Scheduled consumption**
For clubs centered around books or video, the owner/moderators can establish a basic consumption schedule.

For example:

> Week 1 — Chapters 1–5
> Week 2 — Chapters 6–10
> Week 3 — Chapters 11–15

or:

> Watch Episode 1 by September 5
> Watch Episode 2 by September 12

The schedule should be an organizational feature, not a complicated synchronization system. It gives members a shared point of reference for discussion without making everyone consume the material simultaneously.

That distinction is particularly important for book clubs.

### Club types

I would **not** make every domain a hard-coded club type unless there is genuinely different behavior.

Instead, something like:

* General club
* Book club
* Video/watch club
* TTRPG campaign

These are essentially **club contexts/templates**, not fundamentally different entities.

A book club gets book-oriented schedule/discussion affordances. A watch club gets video-oriented ones. A TTRPG campaign gets campaign-oriented organization. A general club can simply be a community around whatever the members want.

Music is a good example of why we shouldn't force this into a rigid taxonomy. A permanent “Music Club” doesn't necessarily need special infrastructure. But an album release club/event could make sense. The same underlying Club can support that without us having to invent a whole music-club subsystem.

### Sessions are separate from Clubs

This should probably be an explicit architectural rule:

**Club = persistent asynchronous group.**
**Session = temporary synchronous activity involving some/all club members.**

So:

* A book club discusses *The Hobbit* over several weeks.
* A watch club discusses a show asynchronously.
* Someone starts a **watch party from the club** for Friday at 8 PM.
* A club member starts a **listen-together session** for an album.
* A TTRPG campaign club organizes its campaign asynchronously and can potentially have scheduled play sessions.

The session belongs to or originates from the Club, but it doesn't redefine the Club.

That also means we don't need to make “watch club” and “watch party” competing concepts. They're different layers.

### What I would explicitly put in V1

I'd make the V1 Clubs scope something like:

**§15 Clubs**

* [ ] Clubs as a first-class social grouping of users
* [ ] Public/joinable and private/invite-only clubs
* [ ] Club ownership and basic member roles
* [ ] Club membership management
* [ ] Club profile: name, description, cover, members
* [ ] Persistent asynchronous club feed
* [ ] Discussion topics and replies
* [ ] Pinned/closed topics
* [ ] Basic announcements
* [ ] Clubs can optionally be oriented around a media domain
* [ ] Book/video clubs can associate works with the club
* [ ] Book/video clubs can create basic shared consumption schedules
* [ ] Members can see the current/upcoming club schedule
* [ ] Club owner/moderator can initiate a watch party from the club
* [ ] Club owner/moderator can initiate a listen-together session from the club
* [ ] TTRPG campaigns can use Clubs as their persistent asynchronous campaign space

And I'd explicitly keep these **out of V1**:

* [ ] Real-time club chat
* [ ] Synchronous session infrastructure beyond launching/connecting to existing experiences
* [ ] Quote/annotation sharing
* [ ] Advanced social graphs
* [ ] Sophisticated recommendation systems
* [ ] Advanced synchronization
* [ ] Expanded media integrations
* [ ] Rich club statistics/analytics
* [ ] Advanced sharing
* [ ] Sophisticated event/calendar functionality
* [ ] Specialized music clubs
* [ ] Specialized photo clubs

The last few are important because otherwise “Clubs” becomes a dumping ground for every vaguely social feature.

### V2 areas become much less vague

Then the existing V2 list can be rewritten as capabilities that build **on top of Clubs**:

**§V2 Social & Collaborative Features**

* Book-club enhancements
* Watch-party enhancements
* Listen-together enhancements
* Quote and annotation sharing
* Richer social interaction
* Richer recommendation systems
* Advanced playback synchronization
* Additional media integrations
* Richer club/member statistics
* Advanced sharing and invitations

And I'd change the original “book clubs” V2 item to something like **“Advanced book-club features”**, because basic book clubs are now explicitly V1.

The conceptual hierarchy becomes:

**Club → persistent group**
**Topic → asynchronous conversation**
**Schedule → shared consumption target**
**Session → synchronous activity launched from the club**
**Media/work → what the group is organizing around**

That model handles book clubs, watch clubs, TTRPG campaigns, and occasional album/listening events without pretending they're all the same kind of experience.


Yes. I think the schedule should be more than a calendar attached to the club. It should be the mechanism that creates the club's recurring structure.

For a book club, for example, the owner creates a reading plan:

> Every Friday
> Read through Chapter 4
> Discussion opens Friday

That produces a **scheduled discussion topic** for each occurrence. So the club isn't asking the owner to manually create “Chapter 4 Discussion,” “Chapter 5 Discussion,” etc.

I'd model it roughly like this:

**Club**
→ has members
→ has media/works
→ has recurring or one-off schedule items
→ schedule items generate discussion topics
→ topics have a date/status and optionally a consumption boundary

A schedule could have:

* **Frequency:** one-time, daily, weekly, monthly, custom
* **Day/time:** e.g. every Friday at 7 PM
* **Consumption target:** Chapter 4, Episodes 5–6, pages 100–150, etc.
* **Discussion:** automatically create a discussion topic
* **Topic timing:** open immediately, open on the scheduled date, or perhaps X hours before
* **Title:** automatically generated or customized
* **End date:** optional
* **Number of occurrences:** optional

So:

> Every Friday at 6 PM
> Read one chapter
> Create discussion

could produce:

> **Friday, May 2 — Chapter 4**
> Discussion · Opens May 2

> **Friday, May 9 — Chapter 5**
> Discussion · Opens May 9

etc.

And it doesn't have to be book-specific. A video club could do:

> Every Sunday — Watch one episode → Discussion opens

Or:

> Every Friday — Watch Episodes 5–6 → Discussion opens

And a general club could do:

> Every Friday at 5 PM — Weekly Check-in → Discussion opens

That last example is why I think **“schedule” should be a first-class Club primitive rather than a Book Club feature.**

### So what actually is “book-club enhancement”?

Once we define the V1 system properly, I agree that “book-club enhancements” is too vague. The V2 items should describe actual capabilities.

I'd split it into concrete things like:

**Advanced reading schedules**

* Dependencies between reading milestones
* Multiple simultaneous reading tracks
* Catch-up/reschedule support
* Per-member schedule progress
* Spoiler-aware discussion access
* Reading ahead without exposing future discussions

**Reading-specific discussions**

* Automatically associate a discussion with a chapter/page range
* Spoiler boundaries
* Chapter/page references in posts
* Discussion navigation from the reader
* “I'm caught up” / “I'm behind” status

**Club reading coordination**

* Propose and vote on the next book
* Maintain a club reading queue
* Book nominations
* Voting
* Completed reading history

Those are actual features rather than “make book clubs better.”

### Watch-party enhancements

Likewise, I'd avoid that generic label.

V1 could let a club **start a watch party**.

V2 could specifically add:

* Schedule a watch party in advance
* RSVP/attendance
* Automatically notify club members
* Start from a club discussion
* Automatically create a post/session thread for the party
* Post-party discussion
* Persistent party history
* Host/moderator controls
* Rejoin an in-progress party
* Better synchronization/reconnection
* Spoiler-aware discussion during playback

That also reveals that **watch parties and watch clubs are not the same thing**.

The watch club is asynchronous. The watch party is an event.

### “Richer social interaction” should probably disappear

I agree this is too hand-wavy for a scope document.

If we mean things like reactions, mentions, follows, member profiles, activity, etc., list them explicitly:

* Reactions
* @mentions
* Member profiles within clubs
* Member activity
* Following/friend relationships
* Notifications
* Direct member-to-member sharing

And then decide which belong in V1 versus V2.

I would actually keep **basic reactions and @mentions potentially V1**, because once you have asynchronous discussion, they are pretty fundamental interaction primitives. “Richer social interaction” isn't a useful V2 bucket.

### The really important V1 distinction

I think the Clubs section should therefore define **three different things**:

**Discussion** — something people talk about.

**Schedule** — something that happens according to a date/repeating rule.

**Session** — something people do together in real time.

And a schedule can generate a discussion.

For example:

**Every Friday**
→ consumption target: Chapter 4
→ discussion opens Friday

**Every Friday**
→ consumption target: Chapter 5
→ discussion opens Friday

Or:

**Every Friday**
→ no consumption target
→ discussion: “Weekly Check-in”

That gives us a very general mechanism without making Clubs into a collection of bespoke book/watch features.

And I think **recurring schedules are absolutely V1**, not an advanced feature. A club that says “we meet every Friday” is one of the most basic uses of a social group.
