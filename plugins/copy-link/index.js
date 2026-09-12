aura.on("copy", function () {
  var url = aura.tab.url;
  if (!url) return;
  aura.clipboard.write(url);
  aura.notify("Copied", url);
});
