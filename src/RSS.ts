/**
 * IT IS DEFINITION FOR RSS FEED
 * If you want to get more feed, please add it
 **/
import { RSSItem } from "./index";

const BASE_URL = "https://uta8a.github.io/github-search-rss";
// Query references
// https://docs.github.com/en/github/searching-for-information-on-github/understanding-the-search-syntax
// https://docs.github.com/en/github/searching-for-information-on-github/about-searching-on-github
// TYPE references
// https://docs.github.com/en/graphql/reference/queries#searchresultitemconnection
export const SEARCH_ITEMS: RSSItem[] = [
    // Issues
    {
        title: "oxc issues",
        query: "repo:oxc-project/oxc is:issue is:open",
        TYPE: "ISSUE",
        link: `${BASE_URL}/oxc-issues.json`,
        homepage: "https://github.com/oxc-project/oxc/issues"
    },
    {
        title: "github/roadmap Issues",
        query: "repo:github/roadmap is:issue",
        TYPE: "ISSUE",
        link: `${BASE_URL}/github-roadmap.json`
    },
];
