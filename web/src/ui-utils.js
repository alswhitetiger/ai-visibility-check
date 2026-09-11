export async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

export function useAction(setBusy, setMessage) {
  return async function run(action, success = '') {
    setBusy(true);
    setMessage('');
    try {
      const result = await action();
      if (success) setMessage(success);
      return result;
    } catch (error) {
      setMessage(error.message || '요청을 처리하지 못했습니다.');
      return null;
    } finally {
      setBusy(false);
    }
  };
}
