const API_BASE_URL = "https://registry.anvil.rcac.purdue.edu/api/v2.0";
export async function deleteRepo(name: string) {
  const headers = {
    authorization: `Basic ${process.env.DELETE_REPO_USER}`,
  };

  fetch(`${API_BASE_URL}/projects/anvilops/repositories/${name}`, {
    method: "DELETE",
    headers,
  }).then((response) => {
    if (!response.ok) {
      throw new Error(response.statusText);
    }
  });
}
