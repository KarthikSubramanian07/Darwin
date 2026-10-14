class Trydarwin < Formula
  desc "Evolutionary optimizer for AI agents, inside sandboxes they can't escape"
  homepage "https://trydarwin.pages.dev"
  url "https://github.com/KarthikSubramanian07/Darwin/releases/download/v0.1.0/trydarwin-0.1.0.tar.gz"
  sha256 "194e09d59c6fc5f086382913d2edb5d3366a303a2fb12f50a3c11386a9ec6e2e"
  license "MIT"

  depends_on "python@3.12"

  def install
    # Private venv under libexec; dependencies resolve from PyPI at install time.
    system Formula["python@3.12"].opt_bin/"python3.12", "-m", "venv", libexec
    system libexec/"bin/pip", "install", "--no-cache-dir", buildpath
    bin.install_symlink libexec/"bin/darwin", libexec/"bin/darwin-server"
  end

  test do
    ENV["HOME"] = testpath
    assert_match "fitness curve: [0.375", shell_output("#{bin}/darwin --offline")
    assert_path_exists testpath/".darwin/runs"
  end
end
