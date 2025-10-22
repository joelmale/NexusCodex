import { useState, useEffect } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { AlertTriangle, CheckCircle, FileX, Database, Search } from 'lucide-react'

interface ValidationResult {
  orphanedFiles: {
    orphanedDocuments: Array<{
      id: string
      title: string
      storageKey: string
      uploadedAt: string
      issue: string
    }>
    total: number
  }
  metadataInconsistencies: {
    inconsistentDocuments: Array<{
      id: string
      title: string
      issues: string[]
    }>
    total: number
  }
  elasticIssues: {
    elasticIssues: Array<{
      id: string
      title: string
      issue: string
      searchIndex?: string
      error?: string
    }>
    total: number
  }
  summary: {
    totalOrphaned: number
    totalMetadataIssues: number
    totalElasticIssues: number
    totalIssues: number
  }
}

export default function DataQuality() {
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runValidation = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('http://localhost:3000/api/admin/validation/comprehensive')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to run validation')
      }

      setValidation(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runValidation()
  }, [])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const getSeverityColor = (count: number) => {
    if (count === 0) return 'text-green-600'
    if (count < 5) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getSeverityBadge = (count: number) => {
    if (count === 0) return <Badge variant="default" className="bg-green-100 text-green-800">Good</Badge>
    if (count < 5) return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Warning</Badge>
    return <Badge variant="default" className="bg-red-100 text-red-800">Critical</Badge>
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Data Quality Dashboard</h1>
        <Badge variant="outline" className="text-sm">
          Phase 3: Search & Deduplication
        </Badge>
      </div>

      {/* Summary Cards */}
      {validation && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Orphaned Files</CardTitle>
              <FileX className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getSeverityColor(validation.summary.totalOrphaned)}`}>
                {validation.summary.totalOrphaned}
              </div>
              <p className="text-xs text-muted-foreground">
                Files missing from storage
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Metadata Issues</CardTitle>
              <Database className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getSeverityColor(validation.summary.totalMetadataIssues)}`}>
                {validation.summary.totalMetadataIssues}
              </div>
              <p className="text-xs text-muted-foreground">
                Inconsistent document data
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Search Index Issues</CardTitle>
              <Search className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getSeverityColor(validation.summary.totalElasticIssues)}`}>
                {validation.summary.totalElasticIssues}
              </div>
              <p className="text-xs text-muted-foreground">
                ElasticSearch inconsistencies
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overall Health</CardTitle>
              {validation.summary.totalIssues === 0 ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {getSeverityBadge(validation.summary.totalIssues)}
              </div>
              <p className="text-xs text-muted-foreground">
                Total data quality issues
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Card className="border-red-200">
          <CardContent className="pt-6">
            <div className="text-red-600">
              <strong>Error:</strong> {error}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Refresh Button */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          Data quality validation checks for orphaned files, metadata inconsistencies, and search index issues.
          Run validation regularly to maintain data integrity.
        </p>
        <Button onClick={runValidation} disabled={loading}>
          {loading ? 'Running Validation...' : 'Run Validation'}
        </Button>
      </div>

      {/* Orphaned Files */}
      {validation && validation.orphanedFiles.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileX className="h-5 w-5 text-red-500" />
              Orphaned Files ({validation.orphanedFiles.total})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Storage Key</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validation.orphanedFiles.orphanedDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell className="font-mono text-sm">{doc.storageKey}</TableCell>
                    <TableCell>{formatDate(doc.uploadedAt)}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{doc.issue}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Metadata Issues */}
      {validation && validation.metadataInconsistencies.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-orange-500" />
              Metadata Inconsistencies ({validation.metadataInconsistencies.total})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validation.metadataInconsistencies.inconsistentDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {doc.issues.map((issue, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {issue}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ElasticSearch Issues */}
      {validation && validation.elasticIssues.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-500" />
              Search Index Issues ({validation.elasticIssues.total})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validation.elasticIssues.elasticIssues.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell className="font-medium">{issue.title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{issue.issue}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {issue.searchIndex || issue.error}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* No Issues */}
      {validation && validation.summary.totalIssues === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">All Systems Healthy</h3>
              <p className="text-gray-600">
                No data quality issues found. Your document library is in excellent condition.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}