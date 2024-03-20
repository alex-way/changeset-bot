import type { Context, Probot } from "probot";

function getAbsentMessage(commitSha: string) {
	return `###  ⚠️  No Changeset found

Latest commit: ${commitSha}

Merging this PR will not cause a version bump for any packages. If these changes should not result in a new version, you're good to go. **If these changes should result in a version bump, you need to add a changeset.**`;
}

function getApproveMessage(commitSha: string) {
	return `###  ✅  Changeset detected

Latest commit: ${commitSha}

**The changes in this PR will be included in the next version bump.**`;
}

const webhooks = [
	"pull_request.opened" as const,
	"pull_request.synchronize" as const,
];

type PRContext = Context<(typeof webhooks)[number]>;

async function getCommentId(
	context: PRContext,
	params: { repo: string; owner: string; issue_number: number },
) {
	return context.octokit.issues.listComments(params).then((comments) => {
		const changesetBotComment = comments.data.find(
			(comment) =>
				comment.user?.login === "changeset-bot[bot]" ||
				comment.user?.login === "changesets-test-bot[bot]",
		);
		return changesetBotComment ? changesetBotComment.id : null;
	});
}

async function hasChangesetBeenAdded(
	changedFilesPromise: ReturnType<PRContext["octokit"]["pulls"]["listFiles"]>,
) {
	return changedFilesPromise.then((files) =>
		files.data.some(
			(file) =>
				file.status === "added" &&
				/^\.changeset\/.+\.md$/.test(file.filename) &&
				file.filename !== ".changeset/README.md",
		),
	);
}

export default (app: Probot) => {
	app.on(webhooks, async (context) => {
		if (context.payload.pull_request.head.ref.startsWith("release")) return;

		try {
			const number = context.payload.number;

			const repo = {
				repo: context.payload.repository.name,
				owner: context.payload.repository.owner.login,
			};

			const latestCommitSha = context.payload.pull_request.head.sha;
			const changedFilesPromise = context.octokit.pulls.listFiles({
				...repo,
				pull_number: number,
			});

			const [commentId, hasChangeset] = await Promise.all([
				// we know the comment won't exist on opened events
				// ok, well like technically that's wrong
				// but reducing time is nice here so that
				// deploying this doesn't cost money
				context.payload.action === "synchronize"
					? getCommentId(context, { ...repo, issue_number: number })
					: null,
				hasChangesetBeenAdded(changedFilesPromise),
			] as const);

			const prComment = {
				...repo,
				issue_number: number,
				body: hasChangeset
					? getApproveMessage(latestCommitSha)
					: getAbsentMessage(latestCommitSha),
			};

			if (commentId != null) {
				return context.octokit.issues.updateComment({
					...prComment,
					comment_id: commentId,
				});
			}
			return context.octokit.issues.createComment(prComment);
		} catch (err) {
			console.error(err);
			throw err;
		}
	});
};
