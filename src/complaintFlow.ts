export function handleComplaint(query: string): string | null {
  const q = query.toLowerCase();

  if (
    q.includes("complaint") ||
    q.includes("refund") ||
    q.includes("bad experience") ||
    q.includes("problem")
  ) {
    return `
I'm sorry to hear that. I can help you submit a complaint.

Please provide:
• Order ID
• What went wrong
• Preferred resolution (refund / replacement / credit)

Our team will follow up with you via email or phone shortly.
`;
  }

  return null;
}
