const POSTS_PER_PROMO_BLOCK = 3;

function sortByRanking(a, b) {
  return (b.rankingScore ?? 0) - (a.rankingScore ?? 0);
}

function appendPromoPair(feed, videos, banners, counters) {
  if (videos.length > 0) {
    feed.push(videos[counters.video % videos.length]);
    counters.video += 1;
  }
  if (banners.length > 0) {
    feed.push(banners[counters.banner % banners.length]);
    counters.banner += 1;
  }
}

/**
 * Build home feed: regular posts with one video + one banner after every 3 posts.
 * Cycles through available promo ads. If there are no regular posts, promos show first.
 */
export function buildInterleavedFeed(rankedJobs) {
  const videos = rankedJobs.filter((job) => job.isVideoPost).sort(sortByRanking);
  const banners = rankedJobs.filter((job) => job.isBannerAd).sort(sortByRanking);
  const regularPosts = rankedJobs
    .filter((job) => !job.isVideoPost && !job.isBannerAd)
    .sort(sortByRanking);

  const feed = [];
  const counters = { video: 0, banner: 0 };

  if (regularPosts.length === 0) {
    const rounds = Math.max(videos.length, banners.length);
    for (let i = 0; i < rounds; i += 1) {
      appendPromoPair(feed, videos, banners, counters);
    }
    return feed;
  }

  let postsSincePromo = 0;
  for (const post of regularPosts) {
    feed.push(post);
    postsSincePromo += 1;
    if (postsSincePromo === POSTS_PER_PROMO_BLOCK) {
      appendPromoPair(feed, videos, banners, counters);
      postsSincePromo = 0;
    }
  }

  return feed;
}
