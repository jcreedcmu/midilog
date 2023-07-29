export async function getText(url: string): Promise<string> {
  const resp = await fetch(new Request(url));
  return await resp.text();
}
