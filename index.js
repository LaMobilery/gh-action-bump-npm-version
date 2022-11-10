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
    await tools.runInWorkspace("git", [
      "config",
      "user.name",
      '"Automated Version Bump"',
    ]);
    await tools.runInWorkspace("git", [
      "config",
      "user.email",
      '"gh-action-bump-version@users.noreply.github.com"',
    ]);

    const currentBranch = /refs\/[a-zA-Z]+\/(.*)/.exec(
      process.env.GITHUB_REF
    )[1];
    console.log("currentBranch:", currentBranch);

    // do it in the current checked out github branch (DETACHED HEAD)
    // important for further usage of the package.json version
    await tools.runInWorkspace("npm", [
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
    await tools.runInWorkspace("git", ["commit", "-a", "--no-edit"]);

    await tools.runInWorkspace("git", ["checkout", currentBranch]);
    await tools.runInWorkspace("npm", [
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

    newVersion = execSync(
      `npm version --git-tag-version=false ${versionSegmentToIncrement}`
    )
      .toString()
      .trim();
    console.log("new version:", newVersion);

    try {
      await tools.runInWorkspace("git", [
        "commit",
        "-a",
        "-m",
        `ci: ${commitMessage} ${newVersion}`,
      ]);
    } catch (e) {
      console.warn(
        'git commit failed because you are using "actions/checkout@v2"; ' +
          'but that doesnt matter because you dont need that git commit, thats only for "actions/checkout@v1"'
      );
    }

    const remoteRepo = `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`;
    await tools.runInWorkspace("git", ["tag", newVersion]);
    await tools.runInWorkspace("git", ["pull", remoteRepo, "--no-edit"]);
    await tools.runInWorkspace("git", [
      "push",
      remoteRepo,
      "--follow-tags",
      "--no-verify",
    ]);
    await tools.runInWorkspace("git", [
      "push",
      remoteRepo,
      "--tags",
      "--no-verify",
    ]);
  } catch (e) {
    tools.log.fatal(e);
    tools.exit.failure("Failed to bump version");
  }

  tools.exit.success("Version bumped!");
});

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
