import { Feed } from "feed";
import dayjs from "dayjs";
import { SEARCH_ITEMS } from "./RSS";
import * as fs from "fs/promises";
import path from "path";
import { graphql } from "@octokit/graphql";
import { Issue, PullRequest, Repository, SearchResultItemConnection, SearchType } from "@octokit/graphql-schema";
import { convertJsonToOPML } from "./toOPML";

function escapeSpecialChars(str: string) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

type Item = {
    url: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    author: {
        avatarUrl: string;
        login: string;
        url: string;
    };
    bodyHTML: string;
    labels: string[];
};
export const search = ({
    query,
    TYPE,
    GITHUB_TOKEN,
    SIZE = 20
}: {
    query: string;
    TYPE: SearchType;
    GITHUB_TOKEN: string;
    SIZE: number;
}): Promise<Item[]> => {
    return graphql<{ search: SearchResultItemConnection }>(
        `
            query($QUERY: String!, $TYPE: SearchType!, $SIZE: Int!) {
                search(query: $QUERY, type: $TYPE, first: $SIZE) {
                    edges {
                        node {
                            __typename
                            ... on Repository {
                                url
                                name
                                nameWithOwner
                                createdAt
                                updatedAt
                                owner {
                                    avatarUrl
                                    login
                                    url
                                }
                                description
                                descriptionHTML
                                repositoryTopics(first: 10) {
                                    edges {
                                        node {
                                            topic {
                                                name
                                            }
                                        }
                                    }
                                }
                            }
                            ... on PullRequest {
                                url
                                title
                                createdAt
                                updatedAt
                                author {
                                    avatarUrl
                                    login
                                    url
                                }
                                bodyHTML
                                labels(first: 10) {
                                    edges {
                                        node {
                                            name
                                        }
                                    }
                                }
                            }
                            ... on Issue {
                                url
                                title
                                createdAt
                                updatedAt
                                author {
                                    avatarUrl
                                    login
                                    url
                                }
                                bodyHTML
                                labels(first: 10) {
                                    edges {
                                        node {
                                            name
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `,
        {
            QUERY: query,
            TYPE,
            SIZE,
            headers: {
                authorization: `token ${GITHUB_TOKEN}`
            }
        }
    ).then((res) => {
        const edges = res.search.edges ?? [];
        return edges?.map((edge) => {
            const node = edge?.node as Issue | PullRequest | Repository;
            const isIssue = (node: any): node is Issue | PullRequest => {
                return node.__typename === "Issue" || node.__typename === "PullRequest";
            };
            if (isIssue(node)) {
                return {
                    url: node.url,
                    title: node.title,
                    createdAt: node.createdAt,
                    updatedAt: node.updatedAt,
                    author: {
                        avatarUrl: node.author?.avatarUrl,
                        login: node.author?.login,
                        url: node.author?.url
                    },
                    bodyHTML: node.bodyHTML,
                    labels:
                        node.labels?.edges?.map((edge) => {
                            return edge?.node?.name;
                        }) ?? []
                } as Item;
            } else {
                return {
                    url: node.url,
                    title: node.description ? `${node.nameWithOwner}: ${node.description}` : node.nameWithOwner,
                    createdAt: node.createdAt,
                    updatedAt: node.updatedAt,
                    author: {
                        avatarUrl: node.owner?.avatarUrl,
                        login: node.owner?.login,
                        url: node.owner?.url
                    },
                    bodyHTML: node.descriptionHTML,
                    labels:
                        node.repositoryTopics?.edges?.map((edge) => {
                            return edge?.node?.topic.name;
                        }) ?? []
                } as Item;
            }
        });
    });
};

export type GenerateRSSOptions = {
    title: string;
    description: string;
    link: string;
    homepage?: string;
    image?: string;
    favicon?: string;
    updated: Date;
    filter?: (item: Item) => boolean; // if return true, it is included in the result
};

export const generateRSS = (items: Item[], options: GenerateRSSOptions) => {
    const feed = new Feed({
        title: options.title,
        description: options.description,
        id: options.link,
        link: options.homepage || options.link,
        feedLinks: { json: options.link },
        image: options.image,
        favicon: options.favicon,
        copyright: "github-search-rss",
        updated: options.updated,
        generator: "github-search-rss"
    });
    const filter = options.filter;
    const filteredItems = filter ? items.filter((item) => filter(item)) : items;
    filteredItems.forEach((item) => {
        const body = item.bodyHTML ?? "";
        const image = item.author.avatarUrl
            ? `<img src="${item.author.avatarUrl}" width="64" height="64" alt=""/><br/>`
            : "";
        feed.addItem({
            title: item.title,
            content: image + body,
            link: item.url,
            author: [
                {
                    name: item.author.login,
                    link: item.author.url,
                    email: `${item.author.login}@noreply.github.com`
                }
            ],
            published: dayjs(item.createdAt).toDate(),
            date: dayjs(item.updatedAt).toDate()
        });
    });
    if (path.extname(options.link) === ".json") {
        return feed.json1();
    } else {
        return feed.atom1();
    }
};

export type RSSItem = {
    query: string;
    TYPE: SearchType;
    SIZE?: number;
} & Omit<GenerateRSSOptions, "updated" | "description">;
if (require.main === module) {
    const distDir = path.join(__dirname, "../dist");
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    if (!GITHUB_TOKEN) {
        throw new Error("env.GITHUB_TOKEN required");
    }
    (async function () {
        await fs.mkdir(distDir, {
            recursive: true
        });
        for (const item of SEARCH_ITEMS) {
            try {
                const { query, TYPE, SIZE, ...options } = item;
                const items = await search({
                    query,
                    TYPE,
                    GITHUB_TOKEN: GITHUB_TOKEN,
                    SIZE: SIZE ?? 20
                });
                if (!items) {
                    throw new Error("Can not search:" + query);
                }
                const jsonRSS = generateRSS(items, {
                    ...options,
                    description: `${item.title} on GitHub`,
                    updated: new Date()
                });
                const atomRSS = generateRSS(items, {
                    ...options,
                    link: item.link.replace(/\.json$/, ".rss"),
                    description: `${item.title} on GitHub`,
                    updated: new Date()
                });
                const fileName = path.basename(item.link);
                await fs.writeFile(path.join(distDir, fileName), jsonRSS, "utf-8");
                await fs.writeFile(path.join(distDir, fileName.replace(/\.json$/, ".rss")), atomRSS, "utf-8");
            } catch (error) {
                console.error(`Error on ${item.title}`, error);
                console.log("But continue to next");
            }
        }
        const opml = convertJsonToOPML(SEARCH_ITEMS);
        await fs.writeFile(path.join(distDir, "index.opml"), opml, "utf-8");
        const { feedLinks, slackCommands } = SEARCH_ITEMS.reduce<{
            feedLinks: string[];
            slackCommands: string[];
        }>(
            (acc, feed) => {
                const atomLink = feed.link.replace(/\.json$/, ".rss");
                const feedLink = `<li><a href="https://github.com/search?q=${encodeURIComponent(
                    feed.query
                )}">🔎</a><code>${escapeSpecialChars(feed.query)}</code>: <a href="${feed.link}">${
                    feed.link
                }</a>（<a href="${atomLink}">atom</a>）</li>`;
                const slackCommand = `<code>/feed subscribe <a href="${atomLink}">${atomLink}</a><code>`;
                acc.feedLinks.push(feedLink);
                acc.slackCommands.push(slackCommand);
                return acc;
            },
            { feedLinks: [], slackCommands: [] }
        );
        const index = {
            html: `
            <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>github-search-rss</title>
</head>
<body>
<p>These RSS Feed is search result of GitHub.</p>
<p>Supported Feed Types</p>
<ul>
<li>JSON Feed</li>
<li>Atom Feed</li>
</ul>
<p><a href="./index.opml">OPML Feeds</a></p>
<ul>
${feedLinks.join("\n")}
</ul>
<details>
<summary>Subscribe in slack</summary>

You can subscribe feeds via <code>/feed<code> command

<pre>
${slackCommands.join("\n")}
</pre>

</details>
<footer>
<a href="https://github.com/uta8a/github-search-rss">Source Code</a>
</footer>
</body>
</html>
`
        };
        await fs.writeFile(path.join(distDir, "index.html"), index.html, "utf-8");
    })().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
