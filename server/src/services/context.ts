/** Who is performing a service-layer operation. */
export interface Actor {
  userId: number;
  /** Browser tab id (X-Client-Id) so the originating tab can ignore its own echo. */
  source?: string;
}
