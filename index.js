// @ts-check
const { Toolkit } = require("actions-toolkit");
const { execSync } = require("child_process");

if (process.env.PACKAGEJSON_DIR) {
  process.env.GITHUB_WORKSPACE = `${process.env.GITHUB_WORKSPACE}/${process.env.PACKAGEJSON_DIR}`;
  process.chdir(process.env.GITHUB_WORKSPACE);
}

Toolkit.run(async (tools) => {
  const pkg = tools.getPackageJSON();
  const event = tools.context.payload;

  const messages = event.commits.map(
    (commit) => commit.message + "\n" + commit.body
  );

  const commitMessage = "version bump to";
  const isVersionBump = messages
    .map((message) => message.toLowerCase().includes(commitMessage))
    .includes(true);

  if (isVersionBump) {
    tools.exit.success("No action necessary!");
    return;
  }

  const versionSegmentToIncrement = getVersionSegmentToIncrement(messages);

  try {
    const current = pkg.version.toString();
    await tools.exec("git", [
      "config",
      "user.name",
      '"Automated Version Bump"',
    ]);
    await tools.exec("git", [
      "config",
      "user.email",
      '"gh-action-bump-npm-version@users.noreply.github.com"',
    ]);

    const currentBranch = /refs\/[a-zA-Z]+\/(.*)/.exec(
      process.env.GITHUB_REF
    )[1];
    console.log("currentBranch:", currentBranch);

    // do it in the current checked out github branch (DETACHED HEAD)
    // important for further usage of the package.json version
    await tools.exec("npm", [
      "version",
      "--allow-same-version=true",
      "--git-tag-version=false",
      current,
    ]);
    console.log(
      "current:",
      current,
      "/",
      "version:",
      versionSegmentToIncrement
    );
    let newVersion = execSync(
      `npm version --git-tag-version=false ${versionSegmentToIncrement}`
    )
      .toString()
      .trim();
    await tools.exec("git", [
      "commit",
      "-a",
      "--amend",
      "--no-edit",
      "--no-verify",
    ]);

    console.log(
      "current:",
      current,
      "/",
      "version:",
      versionSegmentToIncrement,
      "new version:",
      newVersion
    );

    const remoteRepo = `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`;
    await tools.exec("git", ["tag", newVersion]);
    await tools.exec("git", [
      "push",
      remoteRepo,
      "--follow-tags",
      "--force-with-lease",
      "--no-verify",
    ]);
  } catch (e) {
    tools.log.fatal(e);
    tools.exit.failure("Failed to bump version");
  }

  tools.exit.success("Version bumped!");
});

/**
 * @param {string[]} messages
 */
function getVersionSegmentToIncrement(messages) {
  if (
    messages
      .map(
        (message) =>
          message.includes("BREAKING CHANGE") || message.includes("major")
      )
      .includes(true)
  ) {
    return "major";
  }

  if (
    messages
      .map(
        (message) =>
          message.toLowerCase().startsWith("feat") ||
          message.toLowerCase().includes("minor")
      )
      .includes(true)
  ) {
    return "minor";
  }

  return "patch";
}
