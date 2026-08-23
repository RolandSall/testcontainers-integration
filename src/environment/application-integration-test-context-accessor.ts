/** Typed access to the application active for the current integration-test file. */
export interface ApplicationIntegrationTestContextAccessor<TApplication> {
  /**
   * Returns the application started for the current annotated test file.
   *
   * @throws Before runner setup completes or when the file is not annotated.
   */
  current(): TApplication;
}
