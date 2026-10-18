import "server-only";

export async function withSerializableRetry<T>(task: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await task(); } catch (error) {
      const candidate = error as { code?: string; meta?: { code?: string }; message?: string } | null;
      const conflict = candidate?.code === "P2034" || candidate?.code === "40001" ||
        candidate?.meta?.code === "40001" ||
        /serialization failure|не удалось сериализовать|code:\s*`?40001/iu.test(candidate?.message ?? "");
      if (!conflict || attempt >= 3) throw error;
    }
  }
}
